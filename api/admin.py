from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Customer, GlassCatalog, GlassThicknessOption, Order, OrderItem, OrderStatusLog


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'full_name', 'role', 'is_active']
    list_filter = ['role', 'is_active']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('full_name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'full_name', 'role', 'password1', 'password2')}),
    )
    ordering = ['email']
    search_fields = ['email', 'full_name']


admin.site.register(Customer)
admin.site.register(GlassCatalog)
admin.site.register(GlassThicknessOption)
admin.site.register(Order)
admin.site.register(OrderItem)
admin.site.register(OrderStatusLog)
