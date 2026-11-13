from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, model_validator
from typing import Literal

from species_presets import PRESETS_BY_KEY


# ---------- User ----------

class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr = Field(max_length=255)

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)

class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=100)
    email: EmailStr | None = Field(default=None, max_length=255)

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    role: str
    created_at: datetime

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Node ----------

class NodeTargetsBase(BaseModel):
    preset_key: str | None = Field(default=None, max_length=64)
    temperature_min: Decimal | None = None
    temperature_max: Decimal | None = None
    humidity_min: Decimal | None = None
    humidity_max: Decimal | None = None
    pressure_min: Decimal | None = None
    pressure_max: Decimal | None = None

    @model_validator(mode="after")
    def _validate_ranges(self):
        for prefix in ("temperature", "humidity", "pressure"):
            minimum = getattr(self, f"{prefix}_min")
            maximum = getattr(self, f"{prefix}_max")
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(
                    f"{prefix}_min must be less than or equal to {prefix}_max"
                )
        return self


class NodeTargetsInput(NodeTargetsBase):
    pass


class NodeTargetsResponse(NodeTargetsBase):
    model_config = ConfigDict(from_attributes=True)

    node_id: int
    updated_at: datetime

    @computed_field
    @property
    def preset_name(self) -> str | None:
        if not self.preset_key:
            return None
        preset = PRESETS_BY_KEY.get(self.preset_key)
        return preset["name"] if preset else None


class NodeBase(BaseModel):
    node_name: str = Field(min_length=1, max_length=100)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(default=None, max_length=150)


class NodeCreate(NodeBase):
    targets: NodeTargetsInput | None = None


class NodeUpdate(BaseModel):
    node_name: str | None = Field(default=None, min_length=1, max_length=100)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(default=None, max_length=150)


class NodeResponse(NodeBase):
    model_config = ConfigDict(from_attributes=True)

    node_id: int
    user_id: int
    status: str
    installed_at: datetime | None
    last_seen: datetime | None
    targets: NodeTargetsResponse | None = None


class SpeciesPresetResponse(BaseModel):
    key: str
    name: str
    group: str
    temperature_min: float
    temperature_max: float
    humidity_min: float
    humidity_max: float
    pressure_min: float
    pressure_max: float


# ---------- Weather Reading ----------

class ReadingBase(BaseModel):
    temperature: Decimal | None = None
    humidity: Decimal | None = None
    pressure: Decimal | None = None
    motion_detected: bool | None = None


class ReadingCreate(ReadingBase):
    node_id: int

class NodeReadingCreate(ReadingBase):
    pass

class ReadingUpdate(BaseModel):
    pass


class ReadingResponse(ReadingBase):
    model_config = ConfigDict(from_attributes=True)

    reading_id: int
    node_id: int
    recorded_at: datetime


# ---------- Hourly Summary ----------

class HourlySummaryResponse(BaseModel):
    summary_id: int
    node_id: int
    hour_start: datetime
    avg_temperature: Decimal | None
    avg_humidity: Decimal | None
    avg_pressure: Decimal | None
    motion_count: int
    min_temperature: Decimal | None
    max_temperature: Decimal | None
    reading_count: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Daily Summary ----------

class DailySummaryResponse(BaseModel):
    date: date
    avg_temperature: Decimal | None
    avg_humidity: Decimal | None
    avg_pressure: Decimal | None
    motion_count: int
    min_temperature: Decimal | None
    max_temperature: Decimal | None
    reading_count: int

# ---------- Node Diagnostic ----------

class DiagnosticBase(BaseModel):
    uptime: int | None = None
    wifi_connected: bool | None = None
    dht22_status: bool | None = None
    pressure_sensor_status: bool | None = None
    pir_status: bool | None = None
    gps_status: bool | None = None


class DiagnosticCreate(DiagnosticBase):
    node_id: int

class NodeDiagnosticCreate(DiagnosticBase):
    pass

class DiagnosticUpdate(DiagnosticBase):
    pass


class DiagnosticResponse(DiagnosticBase):
    model_config = ConfigDict(from_attributes=True)

    diagnostic_id: int
    node_id: int
    recorded_at: datetime


# ---------- Favourite ----------

class FavouriteCreate(BaseModel):
    node_id: int


class FavouriteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    node_id: int


# ---------- Alert ----------

class AlertBase(BaseModel):
    node_id: int
    measurement_type: Literal["temperature", "humidity", "pressure"]
    comparison_operator: Literal[">", "<", ">=", "<=", "=="]
    threshold_value: Decimal
    enabled: bool = True


class AlertCreate(AlertBase):
    pass


class AlertUpdate(BaseModel):
    measurement_type: Literal["temperature", "humidity", "pressure"] | None = None
    comparison_operator: Literal[">", "<", ">=", "<=", "=="] | None = None
    threshold_value: Decimal | None = None
    enabled: bool | None = None


class AlertResponse(AlertBase):
    model_config = ConfigDict(from_attributes=True)

    alert_id: int
    user_id: int
    created_at: datetime
