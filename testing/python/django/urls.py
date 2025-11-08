from django.urls import path
from . import views

urlpatterns = [
    path('api/dj/', views.index, name='index'),
] 