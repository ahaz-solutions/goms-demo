from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('staff', 'Counter Staff'),
        ('production', 'Production Staff'),
    ]
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='staff')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return f"{self.full_name} ({self.role})"


class Customer(models.Model):
    company_name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150)
    phone = models.CharField(max_length=30)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    tax_id = models.CharField(max_length=50, blank=True)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.company_name


class GlassCatalog(models.Model):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='glass_catalog/', blank=True, null=True)
    max_width_mm = models.IntegerField(default=2440)
    max_height_mm = models.IntegerField(default=3660)
    min_width_mm = models.IntegerField(default=100)
    min_height_mm = models.IntegerField(default=100)
    base_price_per_sqm = models.DecimalField(max_digits=10, decimal_places=2)
    cutting_rate_per_sqm = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class GlassThicknessOption(models.Model):
    catalog = models.ForeignKey(GlassCatalog, on_delete=models.CASCADE, related_name='thickness_options')
    thickness_mm = models.IntegerField()
    tempering_allowed = models.BooleanField(default=True)
    surcharge_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=1.0)

    class Meta:
        unique_together = ('catalog', 'thickness_mm')

    def __str__(self):
        return f"{self.catalog.name} - {self.thickness_mm}mm"


class Order(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('pending_payment', 'Pending Payment'),
        ('confirmed', 'Confirmed'),
        ('cutting', 'Cutting'),
        ('tempering', 'Tempering'),
        ('qc', 'QC'),
        ('ready_dispatch', 'Ready for Dispatch'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
        ('on_hold', 'On Hold'),
    ]

    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('downpayment_pending', 'Downpayment Pending Verification'),
        ('downpayment_verified', 'Downpayment Verified'),
        ('balance_due', 'Balance Due'),
        ('fully_paid', 'Fully Paid'),
    ]

    order_number = models.CharField(max_length=30, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='orders')
    order_date = models.DateTimeField(default=timezone.now)
    delivery_deadline = models.DateField()
    total_sqm = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tempering_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rush_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    payment_status = models.CharField(max_length=30, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    is_walkin = models.BooleanField(default=False)
    rush_flag = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='created_orders')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_orders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.order_number:
            from django.utils import timezone
            year = timezone.now().year
            last = Order.objects.filter(order_number__startswith=f'GOMS-{year}-').count()
            self.order_number = f'GOMS-{year}-{str(last + 1).zfill(4)}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.order_number


class Payment(models.Model):
    PAYMENT_TYPE_CHOICES = [
        ('downpayment', 'Downpayment (50%)'),
        ('balance', 'Balance Payment'),
        ('full', 'Full Payment'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES, default='downpayment')
    amount_claimed = models.DecimalField(max_digits=12, decimal_places=2)
    proof_image = models.ImageField(upload_to='payment_proofs/')
    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True, help_text='Customer notes e.g. bank name, transaction ref')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    # Verification fields
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_payments')
    verified_at = models.DateTimeField(null=True, blank=True)
    amount_confirmed = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.order.order_number} — {self.payment_type} ({self.status})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    catalog = models.ForeignKey(GlassCatalog, on_delete=models.PROTECT)
    thickness_mm = models.IntegerField()
    width_mm = models.IntegerField()
    height_mm = models.IntegerField()
    quantity = models.IntegerField(default=1)
    tempering_required = models.BooleanField(default=False)
    cutting_allowance_mm = models.IntegerField(default=3)
    # Calculated
    finished_sqm = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    rough_width_mm = models.IntegerField(default=0)
    rough_height_mm = models.IntegerField(default=0)
    material_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cutting_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tempering_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.order.order_number} - {self.catalog.name} {self.thickness_mm}mm"


class OrderStatusLog(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_logs')
    status_from = models.CharField(max_length=20)
    status_to = models.CharField(max_length=20)
    changed_by = models.ForeignKey(User, on_delete=models.PROTECT)
    timestamp = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True)
