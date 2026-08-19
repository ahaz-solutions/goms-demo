from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Customer, GlassCatalog, GlassThicknessOption, Order, OrderItem, OrderStatusLog, Payment
from decimal import Decimal


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['full_name'] = user.full_name
        token['role'] = user.role
        token['email'] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'full_name': self.user.full_name,
            'role': self.user.role,
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'role', 'is_active']


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'


class GlassThicknessOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlassThicknessOption
        fields = ['id', 'thickness_mm', 'tempering_allowed', 'surcharge_multiplier']


class GlassCatalogSerializer(serializers.ModelSerializer):
    thickness_options = GlassThicknessOptionSerializer(many=True, read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = GlassCatalog
        fields = '__all__'

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url

    def to_representation(self, instance):
        data = super().to_representation(instance)
        return data


class OrderItemSerializer(serializers.ModelSerializer):
    catalog_name = serializers.CharField(source='catalog.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = '__all__'


class OrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            'catalog', 'thickness_mm', 'width_mm', 'height_mm',
            'quantity', 'tempering_required', 'cutting_allowance_mm'
        ]


class OrderStatusLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model = OrderStatusLog
        fields = '__all__'


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.company_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    status_logs = OrderStatusLogSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = '__all__'


class OrderWriteSerializer(serializers.ModelSerializer):
    items = OrderItemWriteSerializer(many=True)

    class Meta:
        model = Order
        fields = ['customer', 'delivery_deadline', 'notes', 'items']

    def calculate_item(self, item_data, catalog):
        width = item_data['width_mm']
        height = item_data['height_mm']
        qty = item_data['quantity']
        allowance = item_data.get('cutting_allowance_mm', 3)
        tempered = item_data.get('tempering_required', False)

        sqm = Decimal(str(width * height)) / Decimal('1000000')
        total_sqm = sqm * qty

        thickness_opt = GlassThicknessOption.objects.filter(
            catalog=catalog, thickness_mm=item_data['thickness_mm']
        ).first()
        surcharge = thickness_opt.surcharge_multiplier if thickness_opt else Decimal('1.0')

        material_cost = total_sqm * catalog.base_price_per_sqm * surcharge
        cutting_cost = total_sqm * catalog.cutting_rate_per_sqm

        tempering_rate = Decimal('150')  # per sqm configurable
        tempering_cost = (total_sqm * tempering_rate) if tempered else Decimal('0')

        line_total = material_cost + cutting_cost + tempering_cost

        return {
            'finished_sqm': total_sqm,
            'rough_width_mm': width + allowance,
            'rough_height_mm': height + allowance,
            'material_cost': material_cost,
            'cutting_cost': cutting_cost,
            'tempering_cost': tempering_cost,
            'line_total_price': line_total,
        }

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        user = self.context['request'].user

        # Check rush order
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.now().date()
        deadline = validated_data['delivery_deadline']
        lead_days = 3
        suggested_date = today + timedelta(days=lead_days)
        rush_flag = deadline < suggested_date

        order = Order.objects.create(
            **validated_data,
            created_by=user,
            rush_flag=rush_flag,
            status='confirmed',
        )

        total_sqm = Decimal('0')
        subtotal = Decimal('0')
        tempering_total = Decimal('0')

        for item_data in items_data:
            catalog = item_data['catalog']
            calcs = self.calculate_item(item_data, catalog)

            OrderItem.objects.create(
                order=order,
                **item_data,
                **calcs,
            )

            total_sqm += calcs['finished_sqm']
            subtotal += calcs['material_cost'] + calcs['cutting_cost']
            tempering_total += calcs['tempering_cost']

        rush_charge = (subtotal + tempering_total) * Decimal('0.25') if rush_flag else Decimal('0')
        tax_rate = Decimal('0.15')
        pre_tax = subtotal + tempering_total + rush_charge
        tax_amount = pre_tax * tax_rate
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
            status_to='confirmed',
            changed_by=user,
            remarks='Order created and confirmed'
        )

        return order


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.company_name', read_only=True)
    total_price = serializers.CharField(source='order.total_price', read_only=True)
    downpayment_amount = serializers.SerializerMethodField()
    verified_by_name = serializers.CharField(source='verified_by.full_name', read_only=True, default=None)
    proof_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'

    def get_downpayment_amount(self, obj):
        return str((obj.order.total_price * Decimal('0.5')).quantize(Decimal('0.01')))

    def get_proof_image_url(self, obj):
        if not obj.proof_image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.proof_image.url)
        return obj.proof_image.url
