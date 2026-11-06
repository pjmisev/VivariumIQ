USE urcast_db;

CREATE TABLE IF NOT EXISTS `user` (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS node (
    node_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    node_name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    location_name VARCHAR(150),
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    FOREIGN KEY (user_id) REFERENCES `user`(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weather_reading (
    reading_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id INT NOT NULL,
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    light_level DECIMAL(10,2),
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES node(node_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hourly_weather_summary (
    summary_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id INT NOT NULL,
    hour_start DATETIME NOT NULL,
    avg_temperature DECIMAL(5,2),
    avg_humidity DECIMAL(5,2),
    avg_pressure DECIMAL(7,2),
    avg_light_level DECIMAL(10,2),
    min_temperature DECIMAL(5,2),
    max_temperature DECIMAL(5,2),
    reading_count INT NOT NULL,
    FOREIGN KEY (node_id) REFERENCES node(node_id) ON DELETE CASCADE,
    UNIQUE (node_id, hour_start)
);

CREATE TABLE IF NOT EXISTS node_diagnostic (
    diagnostic_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_id INT NOT NULL,
    uptime INT,
    wifi_connected BOOLEAN,
    dht22_status BOOLEAN,
    pressure_sensor_status BOOLEAN,
    light_sensor_status BOOLEAN,
    gps_status BOOLEAN,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES node(node_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favourite (
    user_id INT NOT NULL,
    node_id INT NOT NULL,
    PRIMARY KEY (user_id, node_id),
    FOREIGN KEY (user_id) REFERENCES `user`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES node(node_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert (
    alert_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    node_id INT NOT NULL,
    measurement_type VARCHAR(50) NOT NULL,
    comparison_operator VARCHAR(10) NOT NULL,
    threshold_value DECIMAL(10,2) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES node(node_id) ON DELETE CASCADE
);
