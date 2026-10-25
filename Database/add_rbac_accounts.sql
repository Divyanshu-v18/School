-- Apply once to school_management before creating teacher/staff accounts.
USE school_management;
CREATE TABLE IF NOT EXISTS app_users (
 user_id INT NOT NULL AUTO_INCREMENT, username VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL,
 role ENUM('admin','teacher','staff') NOT NULL, display_name VARCHAR(100) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id), UNIQUE KEY uq_app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS app_sessions (
 session_id INT NOT NULL AUTO_INCREMENT, user_id INT NOT NULL, token_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (session_id), UNIQUE KEY uq_app_sessions_token_hash (token_hash), KEY idx_app_sessions_expiry (expires_at),
 CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
