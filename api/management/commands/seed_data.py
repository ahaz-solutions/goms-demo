from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import User, Customer, GlassCatalog, GlassThicknessOption, Order, OrderItem, OrderStatusLog
from decimal import Decimal
from datetime import date, timedelta


class Command(BaseCommand):
    help = 'Seed demo data for GOMS'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding demo data...')

        # Users
        admin, _ = User.objects.get_or_create(email='admin@goms.com', defaults={
            'full_name': 'System Admin', 'role': 'admin', 'is_staff': True, 'is_superuser': True
        })
        admin.set_password('admin123')
        admin.save()

        manager, _ = User.objects.get_or_create(email='manager@goms.com', defaults={
            'full_name': 'Sara Manager', 'role': 'manager'
        })
        manager.set_password('manager123')
        manager.save()

        staff, _ = User.objects.get_or_create(email='staff@goms.com', defaults={
            'full_name': 'Abel Counter', 'role': 'staff'
        })
        staff.set_password('staff123')
        staff.save()

        production, _ = User.objects.get_or_create(email='production@goms.com', defaults={
            'full_name': 'Kebede Production', 'role': 'production'
        })
        production.set_password('prod123')
        production.save()

        # Customers
        customers_data = [
            {'company_name': 'Sunshine Construction PLC', 'contact_person': 'Dawit Bekele', 'phone': '+251-911-123456', 'email': 'dawit@sunshine.et', 'address': 'Bole, Addis Ababa', 'credit_limit': 200000},
            {'company_name': 'Habesha Contractors', 'contact_person': 'Meseret Alemu', 'phone': '+251-912-234567', 'email': 'meseret@habesha.et', 'address': 'Piassa, Addis Ababa', 'credit_limit': 150000},
            {'company_name': 'Nile Interiors Ltd', 'contact_person': 'Yonas Tesfaye', 'phone': '+251-913-345678', 'email': 'yonas@nile.et', 'address': 'Kazanchis, Addis Ababa', 'credit_limit': 300000},
            {'company_name': 'Atlas Building Supply', 'contact_person': 'Hiwot Girma', 'phone': '+251-914-456789', 'email': 'hiwot@atlas.et', 'address': 'Megenagna, Addis Ababa', 'credit_limit': 100000},
            {'company_name': 'Blue Nile Glass Trading', 'contact_person': 'Tesfaye Worku', 'phone': '+251-915-567890', 'email': 'tesfaye@bluenile.et', 'address': 'CMC, Addis Ababa', 'credit_limit': 250000},
        ]
        customers = []
        for cd in customers_data:
            c, _ = Customer.objects.get_or_create(company_name=cd['company_name'], defaults=cd)
            customers.append(c)

        # Glass Catalog
        catalog_data = [
            {'name': 'Float Clear', 'base_price_per_sqm': Decimal('350'), 'cutting_rate_per_sqm': Decimal('50'), 'max_width_mm': 2440, 'max_height_mm': 3660},
            {'name': 'Low-E Hard Coat', 'base_price_per_sqm': Decimal('850'), 'cutting_rate_per_sqm': Decimal('70'), 'max_width_mm': 2440, 'max_height_mm': 3300},
            {'name': 'Low-E Soft Coat', 'base_price_per_sqm': Decimal('1100'), 'cutting_rate_per_sqm': Decimal('80'), 'max_width_mm': 2440, 'max_height_mm': 3300},
            {'name': 'Reflective Bronze', 'base_price_per_sqm': Decimal('650'), 'cutting_rate_per_sqm': Decimal('60'), 'max_width_mm': 2440, 'max_height_mm': 3660},
            {'name': 'Laminated Safety', 'base_price_per_sqm': Decimal('950'), 'cutting_rate_per_sqm': Decimal('90'), 'max_width_mm': 2200, 'max_height_mm': 3200},
            {'name': 'Patterned / Frosted', 'base_price_per_sqm': Decimal('500'), 'cutting_rate_per_sqm': Decimal('55'), 'max_width_mm': 1830, 'max_height_mm': 2440},
        ]
        thicknesses = {
            'Float Clear': [(4, True, '1.0'), (6, True, '1.0'), (8, True, '1.1'), (10, True, '1.2'), (12, True, '1.3')],
            'Low-E Hard Coat': [(6, True, '1.0'), (8, True, '1.1'), (10, True, '1.2')],
            'Low-E Soft Coat': [(6, False, '1.0'), (8, False, '1.1'), (10, False, '1.2')],
            'Reflective Bronze': [(6, True, '1.0'), (8, True, '1.1'), (10, True, '1.2'), (12, True, '1.3')],
            'Laminated Safety': [(6, False, '1.0'), (8, False, '1.1'), (10, False, '1.2')],
            'Patterned / Frosted': [(4, False, '1.0'), (5, False, '1.0'), (6, False, '1.0')],
        }

        catalogs = []
        for cd in catalog_data:
            cat, _ = GlassCatalog.objects.get_or_create(name=cd['name'], defaults=cd)
            for t_mm, t_allowed, t_mult in thicknesses.get(cd['name'], []):
                GlassThicknessOption.objects.get_or_create(
                    catalog=cat, thickness_mm=t_mm,
                    defaults={'tempering_allowed': t_allowed, 'surcharge_multiplier': Decimal(t_mult)}
                )
            catalogs.append(cat)

        # Sample Orders
        today = date.today()
        sample_orders = [
            {
                'customer': customers[0], 'delivery_deadline': today + timedelta(days=5),
                'status': 'cutting', 'rush_flag': False,
                'items': [
                    {'catalog': catalogs[0], 'thickness_mm': 6, 'width_mm': 1200, 'height_mm': 2100, 'quantity': 4, 'tempering_required': True},
                    {'catalog': catalogs[0], 'thickness_mm': 4, 'width_mm': 800, 'height_mm': 600, 'quantity': 10, 'tempering_required': False},
                ]
            },
            {
                'customer': customers[1], 'delivery_deadline': today + timedelta(days=2),
                'status': 'confirmed', 'rush_flag': True,
                'items': [
                    {'catalog': catalogs[1], 'thickness_mm': 8, 'width_mm': 2000, 'height_mm': 3000, 'quantity': 2, 'tempering_required': False},
                ]
            },
            {
                'customer': customers[2], 'delivery_deadline': today + timedelta(days=7),
                'status': 'tempering', 'rush_flag': False,
                'items': [
                    {'catalog': catalogs[3], 'thickness_mm': 6, 'width_mm': 1500, 'height_mm': 2400, 'quantity': 6, 'tempering_required': True},
                ]
            },
            {
                'customer': customers[3], 'delivery_deadline': today - timedelta(days=1),
                'status': 'qc', 'rush_flag': False,
                'items': [
                    {'catalog': catalogs[4], 'thickness_mm': 8, 'width_mm': 900, 'height_mm': 1200, 'quantity': 8, 'tempering_required': False},
                ]
            },
            {
                'customer': customers[4], 'delivery_deadline': today + timedelta(days=10),
                'status': 'delivered', 'rush_flag': False,
                'items': [
                    {'catalog': catalogs[0], 'thickness_mm': 10, 'width_mm': 2440, 'height_mm': 3000, 'quantity': 3, 'tempering_required': True},
                ]
            },
        ]

        for od in sample_orders:
            items_data = od.pop('items')
            existing = Order.objects.filter(customer=od['customer'], status=od['status']).first()
            if existing:
                continue

            order = Order(
                customer=od['customer'],
                delivery_deadline=od['delivery_deadline'],
                status=od['status'],
                rush_flag=od['rush_flag'],
                created_by=staff,
            )
            order.save()

            total_sqm = Decimal('0')
            subtotal = Decimal('0')
            tempering_total = Decimal('0')

            for item in items_data:
                catalog = item['catalog']
                w, h, qty = item['width_mm'], item['height_mm'], item['quantity']
                sqm = Decimal(str(w * h)) / Decimal('1000000') * qty
                mat = sqm * catalog.base_price_per_sqm
                cut = sqm * catalog.cutting_rate_per_sqm
                temp = (sqm * Decimal('150')) if item['tempering_required'] else Decimal('0')
                line_total = mat + cut + temp

                OrderItem.objects.create(
                    order=order,
                    catalog=catalog,
                    thickness_mm=item['thickness_mm'],
                    width_mm=w, height_mm=h,
                    quantity=qty,
                    tempering_required=item['tempering_required'],
                    cutting_allowance_mm=3,
                    finished_sqm=sqm,
                    rough_width_mm=w + 3,
                    rough_height_mm=h + 3,
                    material_cost=mat,
                    cutting_cost=cut,
                    tempering_cost=temp,
                    line_total_price=line_total,
                )
                total_sqm += sqm
                subtotal += mat + cut
                tempering_total += temp

            rush_charge = (subtotal + tempering_total) * Decimal('0.25') if od['rush_flag'] else Decimal('0')
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
                order=order, status_from='draft', status_to=od['status'],
                changed_by=staff, remarks='Seeded demo order'
            )

        self.stdout.write(self.style.SUCCESS('Demo data seeded successfully!'))
        self.stdout.write('Login credentials:')
        self.stdout.write('  admin@goms.com / admin123')
        self.stdout.write('  manager@goms.com / manager123')
        self.stdout.write('  staff@goms.com / staff123')
