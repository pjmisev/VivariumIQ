from datetime import datetime, timedelta, timezone
from sqlalchemy import func
from database import SessionLocal
from models import WeatherReading, HourlyWeatherSummary

def calculate_hourly_summary():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    previous_hour = now - timedelta(hours=1)

    with SessionLocal() as db:
        results = (
            db.query(
                WeatherReading.node_id,
                func.avg(WeatherReading.temperature),
                func.avg(WeatherReading.humidity),
                func.avg(WeatherReading.pressure),
                func.coalesce(func.sum(WeatherReading.motion_detected), 0),
                func.min(WeatherReading.temperature),
                func.max(WeatherReading.temperature),
                func.count(WeatherReading.reading_id),
            )
            .filter(
                WeatherReading.recorded_at >= previous_hour,
                WeatherReading.recorded_at < now,
            )
            .group_by(WeatherReading.node_id)
            .all()
        )

        for result in results:
            summary = (
                db.query(HourlyWeatherSummary)
                .filter_by(
                    node_id=result[0],
                    hour_start=previous_hour.replace(tzinfo=None),
                )
                .first()
            )
            if summary is None:
                summary = HourlyWeatherSummary(
                    node_id=result[0],
                    hour_start=previous_hour.replace(tzinfo=None),
                )
                db.add(summary)
            summary.avg_temperature = result[1]
            summary.avg_humidity = result[2]
            summary.avg_pressure = result[3]
            summary.motion_count = result[4]
            summary.min_temperature = result[5]
            summary.max_temperature = result[6]
            summary.reading_count = result[7]
        db.commit()
    print(f"Processed {len(results)} hourly summaries.")

if __name__ == "__main__":
    calculate_hourly_summary()