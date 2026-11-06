from datetime import datetime, timezone

from decimal import Decimal
from sqlalchemy import BigInteger, Boolean, DateTime, DECIMAL,ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "user"
    user_id: Mapped[int] = mapped_column(
        Integer, primary_key = True, autoincrement = True)
    username: Mapped[str] = mapped_column(String(100), nullable = False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable = False)
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

class Node(Base):
    __tablename__ = "node"
    node_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.user_id"), nullable=False)
    node_name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 7))
    location_name: Mapped[str | None] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="inactive")
    installed_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=text("CURRENT_TIMESTAMP"))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime)

class WeatherReading(Base):
    __tablename__ = "weather_reading"
    reading_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id"), nullable=False)
    temperature: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    humidity: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    pressure: Mapped[Decimal | None] = mapped_column(DECIMAL(7, 2))
    light_level: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

class NodeDiagnostic(Base):
    __tablename__ = "node_diagnostic"

    diagnostic_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id"), nullable=False)
    uptime: Mapped[int | None] = mapped_column(Integer)
    wifi_connected: Mapped[bool | None] = mapped_column(Boolean)
    dht22_status: Mapped[bool | None] = mapped_column(Boolean)
    pressure_sensor_status: Mapped[bool | None] = mapped_column(Boolean)
    light_sensor_status: Mapped[bool | None] = mapped_column(Boolean)
    gps_status: Mapped[bool | None] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"))

class Favourite(Base):
    __tablename__ = "favourite"
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.user_id"), primary_key=True)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id"), primary_key=True)

class Alert(Base):
    __tablename__ = "alert"
    alert_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.user_id"), nullable=False)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id"), nullable=False)
    measurement_type: Mapped[str] = mapped_column(
        String(50), nullable=False)
    comparison_operator: Mapped[str] = mapped_column(
        String(10), nullable=False)
    threshold_value: Mapped[Decimal] = mapped_column(
        DECIMAL(10, 2), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"))