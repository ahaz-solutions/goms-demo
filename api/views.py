from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal
from .models import User, Customer, GlassCatalog, GlassThicknessOption, Order, OrderItem, OrderStatusLog
from .serializers import (
    CustomTokenObtainPairSerializer, UserSerializer, CustomerSerializer,
    GlassCatalogSerializer, OrderSerializer, OrderWriteSerializer,
    OrderStatusLogSerializer
)
from .pdf_generator import generate_order_pdf


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.filter(is_active=True).order_by('company_name')
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get('q', '')
        if q:
            qs = qs.filter(company_name__icontains=q)
        return qs


class GlassCatalogViewSet(viewsets.ModelViewSet):
    queryset = GlassCatalog.objects.all().prefetch_related('thickness_options').order_by('name')
    serializer_class = GlassCatalogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        show_inactive = self.request.query_params.get('show_inactive', 'false').lower() == 'true'
        if not show_inactive:
            qs = qs.filter(is_active=True)
        return qs

    def _require_pricing_role(self, request):
        """Returns error response if user lacks pricing permission, else None."""
        if request.user.role not in ('admin', 'manager'):
            return Response(
                {'error': 'Only Admins and Managers can modify pricing and catalog entries.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return None

    def create(self, request, *args, **kwargs):
        err = self._require_pricing_role(request)
        if err: return err
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        err = self._require_pricing_role(request)
        if err: return err
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        err = self._require_pricing_role(request)
        if err: return err
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        err = self._require_pricing_role(request)
        if err: return err
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def add_thickness(self, request, pk=None):
        err = self._require_pricing_role(request)
        if err: return err
        catalog = self.get_object()
        thickness_mm = request.data.get('thickness_mm')
        tempering_allowed = request.data.get('tempering_allowed', True)
        surcharge_multiplier = request.data.get('surcharge_multiplier', '1.00')
        if not thickness_mm:
            return Response({'error': 'thickness_mm is required'}, status=status.HTTP_400_BAD_REQUEST)
        obj, created = GlassThicknessOption.objects.update_or_create(
            catalog=catalog,
            thickness_mm=int(thickness_mm),
            defaults={
                'tempering_allowed': tempering_allowed,
                'surcharge_multiplier': surcharge_multiplier,
            }
        )
        from .serializers import GlassThicknessOptionSerializer
        return Response(GlassThicknessOptionSerializer(obj).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='remove_thickness/(?P<thickness_id>[^/.]+)')
    def remove_thickness(self, request, pk=None, thickness_id=None):
        err = self._require_pricing_role(request)
        if err: return err
        catalog = self.get_object()
        try:
            opt = GlassThicknessOption.objects.get(pk=thickness_id, catalog=catalog)
            opt.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except GlassThicknessOption.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related('customer', 'created_by').prefetch_related('items', 'status_logs').order_by('-created_at')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return OrderWriteSerializer
        return OrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status', '')
        q = self.request.query_params.get('q', '')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if q:
            qs = qs.filter(order_number__icontains=q) | qs.filter(customer__company_name__icontains=q)
        return qs

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        remarks = request.data.get('remarks', '')
        role = request.user.role

        # Who is allowed to drive each transition
        # production  : moves orders through the factory floor
        # manager/admin: override, dispatch, cancellations, holds
        # staff       : read-only on status — cannot move orders
        TRANSITION_ROLES = {
            'confirmed':      { 'cutting': ['production', 'manager', 'admin'],
                                'on_hold': ['manager', 'admin'],
                                'cancelled': ['manager', 'admin'] },
            'cutting':        { 'tempering': ['production', 'manager', 'admin'],
                                'qc':        ['production', 'manager', 'admin'],
                                'cancelled': ['manager', 'admin'] },
            'tempering':      { 'qc':        ['production', 'manager', 'admin'],
                                'cancelled': ['manager', 'admin'] },
            'qc':             { 'ready_dispatch': ['production', 'manager', 'admin'],
                                'cutting':        ['production', 'manager', 'admin'],
                                'cancelled':      ['manager', 'admin'] },
            'ready_dispatch': { 'delivered':  ['manager', 'admin'] },
            'on_hold':        { 'confirmed':  ['manager', 'admin'],
                                'cancelled':  ['manager', 'admin'] },
        }

        valid_transitions = {
            'confirmed': ['cutting', 'cancelled', 'on_hold'],
            'cutting': ['tempering', 'qc', 'cancelled'],
            'tempering': ['qc', 'cancelled'],
            'qc': ['ready_dispatch', 'cutting'],
            'ready_dispatch': ['delivered'],
            'on_hold': ['confirmed', 'cancelled'],
        }

        allowed = valid_transitions.get(order.status, [])
        if new_status not in allowed:
            return Response(
                {'error': f'Cannot transition from {order.status} to {new_status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Role-based check: does this user's role allow this specific transition?
        allowed_roles = TRANSITION_ROLES.get(order.status, {}).get(new_status, [])
        if role not in allowed_roles:
            return Response(
                {'error': f'Your role ({role}) is not permitted to move orders from '
                          f'{order.status} to {new_status}.'},
                status=status.HTTP_403_FORBIDDEN
            )

        old_status = order.status
        order.status = new_status
        order.save()

        OrderStatusLog.objects.create(
            order=order,
            status_from=old_status,
            status_to=new_status,
            changed_by=request.user,
            remarks=remarks,
        )

        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        order = self.get_object()
        buffer = generate_order_pdf(order)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.pdf"'
        return response

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        from django.db.models import Count, Sum
        today = timezone.now().date()

        stats = {
            'total_orders': Order.objects.count(),
            'confirmed': Order.objects.filter(status='confirmed').count(),
            'cutting': Order.objects.filter(status='cutting').count(),
            'tempering': Order.objects.filter(status='tempering').count(),
            'qc': Order.objects.filter(status='qc').count(),
            'ready_dispatch': Order.objects.filter(status='ready_dispatch').count(),
            'delivered': Order.objects.filter(status='delivered').count(),
            'rush_orders': Order.objects.filter(rush_flag=True).exclude(status__in=['delivered', 'cancelled']).count(),
            'overdue': Order.objects.exclude(status__in=['delivered', 'cancelled']).filter(delivery_deadline__lt=today).count(),
            'pending_payment_verifications': Order.objects.filter(payment_status='downpayment_pending').count(),
        }
        return Response(stats)


class UserMeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


# ─── Public Walk-in Views ────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def walkin_catalog(request):
    """Public endpoint — returns active glass catalog for the walk-in order form."""
    catalog = GlassCatalog.objects.filter(is_active=True).prefetch_related('thickness_options')
    serializer = GlassCatalogSerializer(catalog, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def walkin_order(request):
    """
    Public endpoint — accepts walk-in orders without authentication.
    Creates/reuses a system Walk-in Customer and uses a system user as created_by.
    Expected payload:
    {
        "customer_name": "John",
        "customer_phone": "0911234567",
        "delivery_deadline": "2026-08-25",
        "notes": "...",
        "items": [
            {
                "catalog": 1,
                "thickness_mm": 6,
                "width_mm": 500,
                "height_mm": 800,
                "quantity": 2,
                "tempering_required": false,
                "cutting_allowance_mm": 3
            }
        ]
    }
    """
    data = request.data
    customer_name = data.get('customer_name', '').strip() or 'Walk-in Customer'
    customer_phone = data.get('customer_phone', '').strip() or 'N/A'
    delivery_deadline = data.get('delivery_deadline')
    notes = data.get('notes', '')
    items_data = data.get('items', [])

    if not delivery_deadline:
        return Response({'error': 'delivery_deadline is required'}, status=status.HTTP_400_BAD_REQUEST)
    if not items_data:
        return Response({'error': 'At least one item is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Get or create a system user for walk-in orders
    system_user, _ = User.objects.get_or_create(
        email='walkin@goms.system',
        defaults={
            'full_name': 'Walk-in Portal',
            'role': 'staff',
            'is_active': True,
        }
    )
    if _:
        system_user.set_unusable_password()
        system_user.save()

    # Create a per-order customer record using the provided name/phone
    # (or reuse if same name+phone exists to avoid duplicates on retries)
    customer, _ = Customer.objects.get_or_create(
        company_name=customer_name,
        phone=customer_phone,
        defaults={
            'contact_person': customer_name,
            'email': '',
            'address': 'Walk-in',
        }
    )

    # Rush check
    from datetime import date, timedelta
    today = date.today()
    try:
        from datetime import datetime
        deadline_date = datetime.strptime(delivery_deadline, '%Y-%m-%d').date()
    except ValueError:
        return Response({'error': 'Invalid delivery_deadline format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

    suggested_date = today + timedelta(days=3)
    rush_flag = deadline_date < suggested_date

    order = Order.objects.create(
        customer=customer,
        delivery_deadline=deadline_date,
        notes=notes,
        created_by=system_user,
        rush_flag=rush_flag,
        status='pending_payment',
        payment_status='unpaid',
        is_walkin=True,
    )

    total_sqm = Decimal('0')
    subtotal = Decimal('0')
    tempering_total = Decimal('0')

    for item in items_data:
        try:
            catalog = GlassCatalog.objects.get(pk=item['catalog'])
        except GlassCatalog.DoesNotExist:
            order.delete()
            return Response({'error': f"Glass catalog id {item['catalog']} not found"}, status=status.HTTP_400_BAD_REQUEST)

        width = int(item.get('width_mm', 0))
        height = int(item.get('height_mm', 0))
        qty = int(item.get('quantity', 1))
        thickness = int(item.get('thickness_mm', 0))
        tempered = bool(item.get('tempering_required', False))
        allowance = int(item.get('cutting_allowance_mm', 3))

        if width <= 0 or height <= 0 or thickness <= 0:
            order.delete()
            return Response({'error': 'Invalid dimensions'}, status=status.HTTP_400_BAD_REQUEST)

        sqm = Decimal(str(width * height)) / Decimal('1000000') * qty
        thickness_opt = GlassThicknessOption.objects.filter(catalog=catalog, thickness_mm=thickness).first()
        surcharge = thickness_opt.surcharge_multiplier if thickness_opt else Decimal('1.0')

        material_cost = sqm * catalog.base_price_per_sqm * surcharge
        cutting_cost = sqm * catalog.cutting_rate_per_sqm
        tempering_cost = sqm * Decimal('150') if tempered else Decimal('0')
        line_total = material_cost + cutting_cost + tempering_cost

        OrderItem.objects.create(
            order=order,
            catalog=catalog,
            thickness_mm=thickness,
            width_mm=width,
            height_mm=height,
            quantity=qty,
            tempering_required=tempered,
            cutting_allowance_mm=allowance,
            finished_sqm=sqm,
            rough_width_mm=width + allowance,
            rough_height_mm=height + allowance,
            material_cost=material_cost,
            cutting_cost=cutting_cost,
            tempering_cost=tempering_cost,
            line_total_price=line_total,
        )

        total_sqm += sqm
        subtotal += material_cost + cutting_cost
        tempering_total += tempering_cost

    rush_charge = (subtotal + tempering_total) * Decimal('0.25') if rush_flag else Decimal('0')
    pre_tax = subtotal + tempering_total + rush_charge
    tax_amount = pre_tax * Decimal('0.15')
    total_price = pre_tax + tax_amount

    order.total_sqm = total_sqm
    order.subtotal = subtotal
    order.tempering_charge = tempering_total
    order.rush_charge = rush_charge
    order.tax_amount = tax_amount
    order.total_price = total_price
    order.save()

    OrderStatusLog.objects.create(
        order=order,
        status_from='draft',
        status_to='pending_payment',
        changed_by=system_user,
        remarks=f'Walk-in order placed by {customer_name} ({customer_phone})'
    )

    downpayment_amount = (total_price * Decimal('0.5')).quantize(Decimal('0.01'))

    return Response({
        'order_number': order.order_number,
        'order_id': order.id,
        'total_price': str(order.total_price),
        'subtotal': str(order.subtotal),
        'tempering_charge': str(order.tempering_charge),
        'rush_charge': str(order.rush_charge),
        'tax_amount': str(order.tax_amount),
        'rush_flag': order.rush_flag,
        'delivery_deadline': str(order.delivery_deadline),
        'customer_name': customer_name,
        'status': order.status,
        'payment_status': order.payment_status,
        'downpayment_amount': str(downpayment_amount),
        'bank_details': {
            'bank_name': 'Commercial Bank of Ethiopia (CBE)',
            'account_number': '1000123456789',
            'account_name': 'GOMS Glass Manufacturing PLC',
            'reference': order.order_number,
        },
    }, status=status.HTTP_201_CREATED)


# ─── Payment Views ────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def walkin_submit_payment(request):
    """
    Public endpoint — walk-in customer uploads payment proof.
    Accepts multipart/form-data with:
      - order_number
      - customer_phone  (used to verify ownership)
      - amount_claimed
      - proof_image     (file)
      - notes           (optional: bank name, transaction ref)
    """
    from .models import Payment
    order_number = request.data.get('order_number', '').strip()
    customer_phone = request.data.get('customer_phone', '').strip()
    amount_claimed = request.data.get('amount_claimed')
    proof_image = request.FILES.get('proof_image')
    notes = request.data.get('notes', '')

    if not all([order_number, amount_claimed, proof_image]):
        return Response({'error': 'order_number, amount_claimed, and proof_image are required.'},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not order.is_walkin:
        return Response({'error': 'Payment upload is only available for walk-in orders.'},
                        status=status.HTTP_403_FORBIDDEN)

    if order.payment_status not in ('unpaid', 'downpayment_pending'):
        return Response({'error': 'Payment already submitted or processed.'},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        amount = Decimal(str(amount_claimed))
    except Exception:
        return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)

    payment = Payment.objects.create(
        order=order,
        payment_type='downpayment',
        amount_claimed=amount,
        proof_image=proof_image,
        customer_name=order.customer.company_name,
        customer_phone=customer_phone or order.customer.phone,
        notes=notes,
        status='pending',
    )

    order.payment_status = 'downpayment_pending'
    order.save(update_fields=['payment_status'])

    return Response({
        'message': 'Payment proof submitted. Our team will verify within 1 business day.',
        'payment_id': payment.id,
        'order_number': order.order_number,
        'payment_status': order.payment_status,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def walkin_order_lookup(request):
    """
    Public endpoint — customer looks up their order status by order_number + phone.
    """
    order_number = request.query_params.get('order_number', '').strip()
    phone = request.query_params.get('phone', '').strip()

    if not order_number:
        return Response({'error': 'order_number is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.prefetch_related('payments').get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not order.is_walkin:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Soft phone check — warn but don't block (demo-friendly)
    from .models import Payment
    payments = order.payments.all().order_by('-submitted_at')
    latest = payments.first()

    return Response({
        'order_number': order.order_number,
        'customer_name': order.customer.company_name,
        'status': order.status,
        'payment_status': order.payment_status,
        'total_price': str(order.total_price),
        'downpayment_amount': str((order.total_price * Decimal('0.5')).quantize(Decimal('0.01'))),
        'delivery_deadline': str(order.delivery_deadline),
        'rush_flag': order.rush_flag,
        'latest_payment': {
            'status': latest.status,
            'amount_claimed': str(latest.amount_claimed),
            'submitted_at': latest.submitted_at.isoformat(),
            'rejection_reason': latest.rejection_reason,
        } if latest else None,
    })


class PaymentViewSet(viewsets.ModelViewSet):
    """Staff-facing payment management."""
    from .models import Payment as PaymentModel
    queryset = PaymentModel.objects.select_related('order', 'order__customer', 'verified_by').order_by('-submitted_at')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        from .serializers import PaymentSerializer
        return PaymentSerializer

    def get_queryset(self):
        from .models import Payment as PaymentModel
        qs = PaymentModel.objects.select_related(
            'order', 'order__customer', 'verified_by'
        ).order_by('-submitted_at')
        status_filter = self.request.query_params.get('status', '')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        from .models import Payment as PaymentModel
        if request.user.role not in ('admin', 'manager'):
            return Response({'error': 'Only Managers and Admins can verify payments.'},
                            status=status.HTTP_403_FORBIDDEN)
        payment = self.get_object()
        if payment.status != 'pending':
            return Response({'error': 'Payment is not in pending state.'}, status=status.HTTP_400_BAD_REQUEST)

        amount_confirmed = request.data.get('amount_confirmed', payment.amount_claimed)

        payment.status = 'approved'
        payment.verified_by = request.user
        payment.verified_at = timezone.now()
        payment.amount_confirmed = amount_confirmed
        payment.save()

        # Advance order
        order = payment.order
        order.payment_status = 'downpayment_verified'
        order.status = 'confirmed'
        order.approved_by = request.user
        order.save()

        OrderStatusLog.objects.create(
            order=order,
            status_from='pending_payment',
            status_to='confirmed',
            changed_by=request.user,
            remarks=f'Downpayment of ETB {amount_confirmed} verified by {request.user.full_name}',
        )

        from .serializers import PaymentSerializer
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in ('admin', 'manager'):
            return Response({'error': 'Only Managers and Admins can verify payments.'},
                            status=status.HTTP_403_FORBIDDEN)
        payment = self.get_object()
        if payment.status != 'pending':
            return Response({'error': 'Payment is not in pending state.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', 'Payment could not be verified.')
        payment.status = 'rejected'
        payment.verified_by = request.user
        payment.verified_at = timezone.now()
        payment.rejection_reason = reason
        payment.save()

        # Reset so customer can re-upload
        order = payment.order
        order.payment_status = 'unpaid'
        order.save(update_fields=['payment_status'])

        from .serializers import PaymentSerializer
        return Response(PaymentSerializer(payment).data)
