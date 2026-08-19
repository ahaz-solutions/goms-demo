from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerViewSet, GlassCatalogViewSet, OrderViewSet, UserMeView,
    walkin_catalog, walkin_order, walkin_submit_payment, walkin_order_lookup,
    PaymentViewSet,
)

router = DefaultRouter()
router.register(r'customers', CustomerViewSet)
router.register(r'glass-catalog', GlassCatalogViewSet)
router.register(r'orders', OrderViewSet)
router.register(r'payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
    path('me/', UserMeView.as_view(), name='user-me'),
    # Public walk-in endpoints (no auth required)
    path('walkin/catalog/', walkin_catalog, name='walkin-catalog'),
    path('walkin/order/', walkin_order, name='walkin-order'),
    path('walkin/payment/', walkin_submit_payment, name='walkin-payment'),
    path('walkin/lookup/', walkin_order_lookup, name='walkin-lookup'),
]
