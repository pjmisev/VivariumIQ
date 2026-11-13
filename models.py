from datetime import datetime, timezone
from typing import Optional

from decimal import Decimal
from sqlalchemy import BigInteger, Boolean, DateTime, DECIMAL,ForeignKey, Integer, String, UniqueConstraint ,text
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    targets: Mapped[Optional["NodeTarget"]] = relationship(
        "NodeTarget", back_populates="node", uselist=False,
        cascade="all, delete-orphan")

class NodeTarget(Base):
    __tablename__ = "node_target"
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id", ondelete="CASCADE"),
        primary_key=True)
    preset_key: Mapped[str | None] = mapped_column(String(64))
    temperature_min: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    temperature_max: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    humidity_min: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    humidity_max: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    pressure_min: Mapped[Decimal | None] = mapped_column(DECIMAL(7, 2))
    pressure_max: Mapped[Decimal | None] = mapped_column(DECIMAL(7, 2))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    node: Mapped["Node"] = relationship("Node", back_populates="targets")

class WeatherReading(Base):
    __tablename__ = "weather_reading"
    reading_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id"), nullable=False)
    temperature: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    humidity: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    pressure: Mapped[Decimal | None] = mapped_column(DECIMAL(7, 2))
    motion_detected: Mapped[bool | None] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

class HourlyWeatherSummary(Base):
    __tablename__ = "hourly_weather_summary"
    summary_id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True)
    node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("node.node_id", ondelete="CASCADE"),
        nullable=False)
    hour_start: Mapped[datetime] = mapped_column(
        DateTime, nullable=False)
    avg_temperature: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    avg_humidity: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    avg_pressure: Mapped[Decimal | None] = mapped_column(DECIMAL(7, 2))
    motion_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"))
    min_temperature: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    max_temperature: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    reading_count: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("node_id", "hour_start"),)

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
    pir_status: Mapped[bool | None] = mapped_column(Boolean)
    gps_status: Mapped[bool | None] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"))

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