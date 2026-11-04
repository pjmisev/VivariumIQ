from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

import models
from database import Base, engine, get_db
from auth import create_access_token, get_current_user, hash_password, verify_password
from schemas import AlertCreate, AlertResponse, AlertUpdate, DiagnosticCreate, DiagnosticResponse, DiagnosticUpdate, FavouriteCreate, FavouriteResponse, NodeCreate, NodeResponse, NodeUpdate, ReadingCreate, ReadingResponse, ReadingUpdate, UserCreate, UserResponse, UserUpdate

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", include_in_schema=False, name="home")
def home(request: Request):
    return templates.TemplateResponse(request, "home.html", {"title": "UrCast"})


@app.get("/api/nodes", response_model=list[NodeResponse])
def get_nodes(db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node))
    return result.scalars().all()


@app.post("/api/node", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
def create_node(node: NodeCreate, db: Annotated[Session, Depends(get_db)]):
    user = db.query(models.User).filter(models.User.user_id == node.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_node = models.Node(
        user_id=node.user_id,
        node_name=node.node_name,
        latitude=node.latitude,
        longitude=node.longitude,
        location_name=node.location_name,
    )
    db.add(new_node)
    db.commit()
    db.refresh(new_node)
    return new_node


@app.get("/api/node/{node_id}", response_model=NodeResponse)
def get_node(node_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node).where(models.Node.node_id == node_id))
    node = result.scalars().first()
    if node:
        return node
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

@app.patch("/api/node/{node_id}", response_model=NodeResponse)
def update_node(node_id: int,node: NodeUpdate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node).where(models.Node.node_id == node_id))
    existing_node = result.scalars().first()
    if not existing_node:
        raise HTTPException(status_code=404,detail="Node not found")
    update_data = node.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_node, field, value)
    db.commit()
    db.refresh(existing_node)
    return existing_node

@app.delete("/api/node/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(node_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node).where(models.Node.node_id == node_id))
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    db.delete(node)
    db.commit()

@app.post("/api/user", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
    result = db.execute(select(models.User).where(models.User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
    new_user = models.User(username=user.username, email=user.email, password_hash=hash_password(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.get("/api/users", response_model=list[UserResponse])
def get_users(db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User))
    return result.scalars().all()

@app.get("/api/user/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == user_id))
    user = result.scalars().first()
    if user:
        return user
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

@app.patch("/api/user/{user_id}", response_model=UserResponse)
def update_user(user_id: int,user: UserUpdate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == user_id))
    existing_user = result.scalars().first()
    if not existing_user:
        raise HTTPException(status_code=404,detail="User not found")
    if user.username is not None and user.username != existing_user.username:
        result = db.execute(
            select(models.User).where(models.User.username == user.username)
        )
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="Username already exists")
    if user.email is not None and user.email != existing_user.email:
        result = db.execute(
            select(models.User).where(models.User.email == user.email)
        )
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="Email already exists")
    update_data = user.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_user, field, value)
    db.commit()
    db.refresh(existing_user)
    return existing_user

@app.delete("/api/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()

@app.exception_handler(StarletteHTTPException)
def general_http_exception_handler(request: Request, exception: StarletteHTTPException):
    message = exception.detail if exception.detail else "An error occurred. Please check your request and try again"
    if request.url.path.startswith("/api"):
        return JSONResponse(status_code=exception.status_code, content={"detail": message})
    return templates.TemplateResponse(
        request,
        "error.html",
        {"status_code": exception.status_code, "title": exception.status_code, "message": message},
        status_code=exception.status_code,
    )


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exception: RequestValidationError):
    if request.url.path.startswith("/api"):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": exception.errors()},
        )
    return templates.TemplateResponse(
        request,
        "error.html",
        {
            "status_code": status.HTTP_422_UNPROCESSABLE_CONTENT,
            "title": status.HTTP_422_UNPROCESSABLE_CONTENT,
            "message": "Invalid request. Please check your input and try again",
        },
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    )

@app.get("/api/diagnostics", response_model=list[DiagnosticResponse])
def get_diagnostics(db: Annotated[Session, Depends(get_db)]):
    diagnostics = db.scalars(select(models.NodeDiagnostic)).all()
    return diagnostics

@app.post("/api/diagnostics", response_model=DiagnosticResponse, status_code=status.HTTP_201_CREATED)
def create_diagnostic(diagnostic: DiagnosticCreate, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node).where(models.Node.node_id == diagnostic.node_id))
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    new_diagnostic = models.NodeDiagnostic(
        node_id=diagnostic.node_id,
        uptime=diagnostic.uptime,
        wifi_connected=diagnostic.wifi_connected,
        dht22_status=diagnostic.dht22_status,
        pressure_sensor_status=diagnostic.pressure_sensor_status,
        light_sensor_status=diagnostic.light_sensor_status,
        gps_status=diagnostic.gps_status,
    )
    db.add(new_diagnostic)
    db.commit()
    db.refresh(new_diagnostic)
    return new_diagnostic

@app.get("/api/diagnostics/{diagnostic_id}", response_model=DiagnosticResponse)
def get_diagnostic(diagnostic_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.NodeDiagnostic).where(models.NodeDiagnostic.diagnostic_id == diagnostic_id))
    diagnostic = result.scalars().first()
    if diagnostic:
        return diagnostic
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Diagnostic not found")

@app.patch("/api/diagnostics/{diagnostic_id}", response_model=DiagnosticResponse)
def update_diagnostic(diagnostic_id: int,diagnostic: DiagnosticUpdate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.NodeDiagnostic).where(models.NodeDiagnostic.diagnostic_id == diagnostic_id))
    existing_diagnostic = result.scalars().first()
    if not existing_diagnostic:raise HTTPException(status_code=404,detail="Diagnostic not found")
    update_data = diagnostic.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_diagnostic, field, value)
    db.commit()
    db.refresh(existing_diagnostic)
    return existing_diagnostic

@app.delete("/api/diagnostics/{diagnostic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_diagnostic(diagnostic_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.NodeDiagnostic).where(models.NodeDiagnostic.diagnostic_id == diagnostic_id))
    diagnostic = result.scalars().first()
    if not diagnostic:
        raise HTTPException(status_code=404, detail="Diagnostic not found")
    db.delete(diagnostic)
    db.commit()

@app.get("/api/readings", response_model=list[ReadingResponse])
def get_readings(db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.WeatherReading))
    return result.scalars().all()

@app.get("/api/reading/{reading_id}", response_model=ReadingResponse)
def get_reading(reading_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.WeatherReading).where(models.WeatherReading.reading_id == reading_id))
    reading = result.scalars().first()
    if reading:
        return reading
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Weather reading not found")

@app.post("/api/reading", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
def create_reading(reading: ReadingCreate, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Node).where(models.Node.node_id == reading.node_id))
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Node not found")
    new_reading = models.WeatherReading(
        node_id=reading.node_id,
        temperature=reading.temperature,
        humidity=reading.humidity,
        pressure=reading.pressure,
        light_level=reading.light_level
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading

@app.patch("/api/reading/{reading_id}", response_model=ReadingResponse)
def update_reading(reading_id: int,reading: ReadingUpdate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.WeatherReading).where(models.WeatherReading.reading_id == reading_id))
    existing_reading = result.scalars().first()
    if not existing_reading:
        raise HTTPException(status_code=404,detail="Weather reading not found")
    update_data = reading.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_reading, field, value)
    db.commit()
    db.refresh(existing_reading)
    return existing_reading

@app.delete("/api/reading/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(reading_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.WeatherReading).where(models.WeatherReading.reading_id == reading_id))
    reading = result.scalars().first()
    if not reading:
        raise HTTPException(status_code=404, detail="Weather reading not found")
    db.delete(reading)
    db.commit()

@app.get("/api/favourites", response_model=list[FavouriteResponse])
def get_favourites(db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Favourite))
    return result.scalars().all()

@app.get("/api/user/{user_id}/favourites", response_model=list[FavouriteResponse])
def get_user_favourites(user_id: int,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404,detail="User not found")
    result = db.execute(select(models.Favourite).where(models.Favourite.user_id == user_id))
    return result.scalars().all()

@app.post(
    "/api/user/{user_id}/favourites",
    response_model=FavouriteResponse,
    status_code=status.HTTP_201_CREATED
)
def create_favourite(user_id: int,favourite: FavouriteCreate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == user_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="User not found")
    result = db.execute(select(models.Node).where(models.Node.node_id == favourite.node_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Node not found")
    result = db.execute(select(models.Favourite).where(models.Favourite.user_id == user_id,models.Favourite.node_id == favourite.node_id))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Favourite already exists")
    new_favourite = models.Favourite(user_id=user_id,node_id=favourite.node_id)
    db.add(new_favourite)
    db.commit()
    db.refresh(new_favourite)
    return new_favourite

@app.delete("/api/user/{user_id}/favourites/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_favourite(user_id: int,node_id: int,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Favourite).where(models.Favourite.user_id == user_id,models.Favourite.node_id == node_id))
    favourite = result.scalars().first()
    if not favourite:
        raise HTTPException(status_code=404, detail="Favourite not found")
    db.delete(favourite)
    db.commit()

@app.get("/api/alerts", response_model=list[AlertResponse])
def get_alerts(db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Alert))
    return result.scalars().all()

@app.get("/api/alert/{alert_id}", response_model=AlertResponse)
def get_alert(alert_id: int,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Alert).where(models.Alert.alert_id == alert_id))
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404,detail="Alert not found")
    return alert

@app.post(
    "/api/alert",response_model=AlertResponse,status_code=status.HTTP_201_CREATED)
def create_alert(alert: AlertCreate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.User).where(models.User.user_id == alert.user_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404,detail="User not found")
    result = db.execute(select(models.Node).where(models.Node.node_id == alert.node_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404,detail="Node not found")
    new_alert = models.Alert(
        user_id=alert.user_id,
        node_id=alert.node_id,
        measurement_type=alert.measurement_type,
        comparison_operator=alert.comparison_operator,
        threshold_value=alert.threshold_value,
        enabled=alert.enabled
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)
    return new_alert

@app.patch("/api/alert/{alert_id}", response_model=AlertResponse)
def update_alert(alert_id: int,alert: AlertUpdate,db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Alert).where(models.Alert.alert_id == alert_id))
    existing_alert = result.scalars().first()
    if not existing_alert:
        raise HTTPException(status_code=404,detail="Alert not found")
    update_data = alert.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_alert, field, value)
    db.commit()
    db.refresh(existing_alert)
    return existing_alert

@app.delete("/api/alert/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: int, db: Annotated[Session, Depends(get_db)]):
    result = db.execute(select(models.Alert).where(models.Alert.alert_id == alert_id))
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()