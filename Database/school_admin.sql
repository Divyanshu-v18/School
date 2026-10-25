CREATE DATABASE IF NOT EXISTS school_management;

USE school_management;


-- ========================================
-- SUBJECTS
-- ========================================

CREATE TABLE subjects (
    subject_id   INT PRIMARY KEY AUTO_INCREMENT,
    subject_name VARCHAR(100) NOT NULL,
    subject_code VARCHAR(20) NOT NULL UNIQUE,
    class_name   VARCHAR(20) NOT NULL,
    description  VARCHAR(255),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- ATTENDANCE
-- ========================================

CREATE TABLE attendance (
    attendance_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id    INT NOT NULL,
    student_name  VARCHAR(60) NOT NULL,
    class_name    VARCHAR(20) NOT NULL,
    section       VARCHAR(5) NOT NULL,
    date          DATE NOT NULL,
    status        ENUM('Present', 'Absent', 'Late') NOT NULL DEFAULT 'Present',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (student_id, date)
);


-- ========================================
-- FEE STRUCTURE
-- ========================================

CREATE TABLE fee_structure (
    fee_id        INT PRIMARY KEY AUTO_INCREMENT,
    class_name    VARCHAR(20) NOT NULL,
    fee_type      VARCHAR(50) NOT NULL,
    amount        DECIMAL(10, 2) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    due_date      DATE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- FEE PAYMENTS
-- ========================================

CREATE TABLE fee_payments (
    payment_id   INT PRIMARY KEY AUTO_INCREMENT,
    student_id   INT NOT NULL,
    student_name VARCHAR(60) NOT NULL,
    class_name   VARCHAR(20) NOT NULL,
    fee_type     VARCHAR(50) NOT NULL,
    amount_paid  DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_mode ENUM('Cash', 'Online', 'Cheque', 'UPI') NOT NULL DEFAULT 'Cash',
    status       ENUM('Paid', 'Pending', 'Partial') NOT NULL DEFAULT 'Paid',
    remarks      VARCHAR(255),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- EXAMS
-- ========================================

CREATE TABLE exams (
    exam_id    INT PRIMARY KEY AUTO_INCREMENT,
    exam_name  VARCHAR(100) NOT NULL,
    class_name VARCHAR(20) NOT NULL,
    subject    VARCHAR(100) NOT NULL,
    exam_date  DATE NOT NULL,
    max_marks  INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- EXAM RESULTS
-- ========================================

CREATE TABLE exam_results (
    result_id      INT PRIMARY KEY AUTO_INCREMENT,
    exam_id        INT NOT NULL,
    student_id     INT NOT NULL,
    student_name   VARCHAR(60) NOT NULL,
    marks_obtained INT NOT NULL,
    grade          VARCHAR(5),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_result_exam
        FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
        ON DELETE CASCADE
);


-- ========================================
-- NOTICES
-- ========================================

CREATE TABLE notices (
    notice_id  INT PRIMARY KEY AUTO_INCREMENT,
    title      VARCHAR(200) NOT NULL,
    content    TEXT NOT NULL,
    category   ENUM('General', 'Academic', 'Event', 'Holiday', 'Urgent') NOT NULL DEFAULT 'General',
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- TIMETABLE
-- ========================================

CREATE TABLE timetable (
    timetable_id  INT PRIMARY KEY AUTO_INCREMENT,
    class_name    VARCHAR(20) NOT NULL,
    section       VARCHAR(5) NOT NULL,
    day_of_week   ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
    period_number INT NOT NULL,
    subject       VARCHAR(100) NOT NULL,
    teacher_name  VARCHAR(60),
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_slot (class_name, section, day_of_week, period_number)
);


-- ========================================
-- CALENDAR EVENTS
-- ========================================

CREATE TABLE calendar_events (
    event_id    INT PRIMARY KEY AUTO_INCREMENT,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    event_date  DATE NOT NULL,
    end_date    DATE,
    event_type  ENUM('Holiday', 'Exam', 'Event', 'Meeting', 'Other') NOT NULL DEFAULT 'Event',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- TRANSPORT VEHICLES
-- ========================================

CREATE TABLE transport_vehicles (
    vehicle_id     INT PRIMARY KEY AUTO_INCREMENT,
    vehicle_number VARCHAR(30) NOT NULL UNIQUE,
    vehicle_type   ENUM('Bus', 'Mini Bus', 'Van') NOT NULL DEFAULT 'Bus',
    model_name     VARCHAR(100) NOT NULL,
    capacity       INT NOT NULL,
    route_name     VARCHAR(100) NOT NULL,
    fitness_expiry DATE,
    status         ENUM('Active', 'Maintenance', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- TRANSPORT DRIVERS
-- ========================================

CREATE TABLE transport_drivers (
    driver_id      INT PRIMARY KEY AUTO_INCREMENT,
    full_name      VARCHAR(100) NOT NULL,
    phone          VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) NOT NULL UNIQUE,
    vehicle_id     INT,
    status         ENUM('Active', 'On Route', 'On Leave') NOT NULL DEFAULT 'Active',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES transport_vehicles(vehicle_id)
        ON DELETE SET NULL
);


-- ========================================
-- TRANSPORT STUDENTS ENROLLMENT
-- ========================================

CREATE TABLE transport_students (
    enrollment_id     INT PRIMARY KEY AUTO_INCREMENT,
    student_id        INT NOT NULL UNIQUE,
    route_name        VARCHAR(100) NOT NULL,
    pickup_drop_stop  VARCHAR(150) NOT NULL,
    vehicle_id        INT,
    emergency_contact VARCHAR(20),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_transport_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES transport_vehicles(vehicle_id)
        ON DELETE SET NULL
);
