-- =============================================================================
-- LEGACY, ONE-TIME SOURCE MIGRATION ONLY.
--
-- This file is not part of normal setup or application operation.  It requires
-- the historical source schemas to exist and is retained solely as migration
-- provenance. Do not run it against a populated school_management database:
-- its historical INSERT statements are not rerunnable safely.
-- =============================================================================
-- MIGRATION: Consolidate school_student + school_teacher + school_admin
--            into a single database: school_management
--
-- SAFETY GUARANTEES:
--   * Does NOT drop, alter, or truncate school_student, school_teacher,
--     or school_admin.
--   * All INSERTs use explicit INSERT INTO ... SELECT ... FROM old_db.
--   * Each logical group is wrapped in a TRANSACTION.
--   * AUTO_INCREMENT values are preserved.
--   * Foreign-key constraints are added AFTER data is loaded.
-- =============================================================================


-- STEP 0: Create the new database
CREATE DATABASE IF NOT EXISTS school_management
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE school_management;


-- =============================================================================
-- STEP 1: Create tables from school_student (no FK constraints yet)
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_details (
    student_id    INT NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(60) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender        ENUM('Male', 'Female', 'Other') NOT NULL,
    category      ENUM('General', 'EWS', 'OBC', 'SC', 'ST', 'Others') NOT NULL,
    blood_group   ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    PRIMARY KEY (student_id)
) ENGINE=InnoDB AUTO_INCREMENT=10000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS student_personal_details (
    student_id          INT NOT NULL,
    admission_date      DATE NOT NULL,
    admission_no        VARCHAR(20) NOT NULL,
    aadhar_no_last_four CHAR(4) NOT NULL,
    apaar_no            CHAR(12) NOT NULL,
    pen_no              VARCHAR(20) NOT NULL,
    bpl                 ENUM('YES', 'NO') NOT NULL,
    class               ENUM('KIDSCARE','NUR','LKG','UKG','1','2','3','4','5','6','7','8','9','10','11','12') DEFAULT NULL,
    section             ENUM('A','B','C','D') DEFAULT NULL,
    PRIMARY KEY (student_id),
    UNIQUE KEY uq_admission_no (admission_no),
    UNIQUE KEY uq_aadhar_no_last_four (aadhar_no_last_four),
    UNIQUE KEY uq_apaar_no (apaar_no),
    UNIQUE KEY uq_pen_no (pen_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS student_parent_details (
    student_id              INT NOT NULL,
    father_name             VARCHAR(60) NOT NULL,
    father_aadhar_last_four CHAR(4) NOT NULL,
    father_phone            VARCHAR(10) DEFAULT NULL,
    mother_name             VARCHAR(60) NOT NULL,
    mother_aadhar_last_four CHAR(4) NOT NULL,
    mother_phone            VARCHAR(10) DEFAULT NULL,
    PRIMARY KEY (student_id),
    UNIQUE KEY uq_father_aadhar (father_aadhar_last_four),
    UNIQUE KEY uq_mother_aadhar (mother_aadhar_last_four)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS student_address (
    address_id INT NOT NULL,
    student_id INT NOT NULL,
    house_no   VARCHAR(10) DEFAULT NULL,
    pincode    CHAR(6) NOT NULL,
    street     VARCHAR(200) NOT NULL,
    city       VARCHAR(50) NOT NULL,
    state      VARCHAR(50) NOT NULL,
    PRIMARY KEY (address_id),
    KEY idx_student_address_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- STEP 2: Create tables from school_teacher (no FK constraints yet)
-- =============================================================================

CREATE TABLE IF NOT EXISTS teacher_details (
    teacher_id    INT NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(60) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender        ENUM('Male', 'Female', 'Other') NOT NULL,
    category      ENUM('General', 'EWS', 'OBC', 'SC', 'ST', 'Others') NOT NULL,
    blood_group   ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    phone         VARCHAR(10) NOT NULL,
    email         VARCHAR(100) NOT NULL,
    PRIMARY KEY (teacher_id),
    UNIQUE KEY uq_teacher_phone (phone),
    UNIQUE KEY uq_teacher_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS teacher_address (
    teacher_id INT NOT NULL,
    house_no   VARCHAR(10) DEFAULT NULL,
    street     VARCHAR(200) NOT NULL,
    city       VARCHAR(50) NOT NULL,
    state      VARCHAR(50) NOT NULL,
    pincode    CHAR(6) NOT NULL,
    PRIMARY KEY (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS teacher_personal_details (
    teacher_id      INT NOT NULL,
    date_of_joining DATE NOT NULL,
    joining_no      VARCHAR(20) DEFAULT NULL,
    aadhar_no       CHAR(12) NOT NULL,
    qualification   VARCHAR(30) NOT NULL,
    post            VARCHAR(50) NOT NULL,
    cl              INT NOT NULL,
    PRIMARY KEY (teacher_id),
    UNIQUE KEY uq_teacher_aadhar (aadhar_no),
    UNIQUE KEY uq_teacher_joining_no (joining_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- STEP 3: Create tables from school_admin (no FK constraints yet)
-- =============================================================================

CREATE TABLE IF NOT EXISTS subjects (
    subject_id   INT NOT NULL AUTO_INCREMENT,
    subject_name VARCHAR(100) NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    class_name   VARCHAR(20) NOT NULL,
    description  VARCHAR(255) DEFAULT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subject_id),
    UNIQUE KEY uq_subject_code (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT NOT NULL AUTO_INCREMENT,
    student_id    INT NOT NULL,
    student_name  VARCHAR(60) NOT NULL,
    class_name    VARCHAR(20) NOT NULL,
    section       VARCHAR(5) NOT NULL,
    date          DATE NOT NULL,
    status        ENUM('Present', 'Absent', 'Late') NOT NULL DEFAULT 'Present',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (attendance_id),
    UNIQUE KEY uq_attendance_student_date (student_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS teacher_attendance (
    id           INT NOT NULL AUTO_INCREMENT,
    teacher_id   INT NOT NULL,
    teacher_name VARCHAR(100) NOT NULL,
    post         VARCHAR(100) DEFAULT NULL,
    date         DATE NOT NULL,
    status       ENUM('Present','Absent') DEFAULT 'Present',
    time_in      VARCHAR(20) DEFAULT '09:00',
    time_out     VARCHAR(20) DEFAULT '16:00',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_teacher_attendance_date (teacher_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS fee_structure (
    fee_id        INT NOT NULL AUTO_INCREMENT,
    class_name    VARCHAR(20) NOT NULL,
    fee_type      VARCHAR(50) NOT NULL,
    amount        DECIMAL(10, 2) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    due_date      DATE DEFAULT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS fee_payments (
    payment_id   INT NOT NULL AUTO_INCREMENT,
    student_id   INT NOT NULL,
    student_name VARCHAR(60) NOT NULL,
    class_name   VARCHAR(20) NOT NULL,
    fee_type     VARCHAR(50) NOT NULL,
    amount_paid  DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_mode ENUM('Cash', 'Online', 'Cheque', 'UPI') NOT NULL DEFAULT 'Cash',
    status       ENUM('Paid', 'Pending', 'Partial') NOT NULL DEFAULT 'Paid',
    remarks      VARCHAR(255) DEFAULT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS exams (
    exam_id    INT NOT NULL AUTO_INCREMENT,
    exam_name  VARCHAR(100) NOT NULL,
    class_name VARCHAR(20) NOT NULL,
    subject    VARCHAR(100) NOT NULL,
    exam_date  DATE NOT NULL,
    max_marks  INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS exam_results (
    result_id      INT NOT NULL AUTO_INCREMENT,
    exam_id        INT NOT NULL,
    student_id     INT NOT NULL,
    student_name   VARCHAR(60) NOT NULL,
    marks_obtained INT NOT NULL,
    grade          VARCHAR(5) DEFAULT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (result_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS notices (
    notice_id  INT NOT NULL AUTO_INCREMENT,
    title      VARCHAR(200) NOT NULL,
    content    TEXT NOT NULL,
    category   ENUM('General', 'Academic', 'Event', 'Holiday', 'Urgent') NOT NULL DEFAULT 'General',
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS timetable (
    timetable_id  INT NOT NULL AUTO_INCREMENT,
    class_name    VARCHAR(20) NOT NULL,
    section       VARCHAR(5) NOT NULL,
    day_of_week   ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') NOT NULL,
    period_number INT NOT NULL,
    subject       VARCHAR(100) NOT NULL,
    teacher_name  VARCHAR(60) DEFAULT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (timetable_id),
    UNIQUE KEY uq_timetable_slot (class_name, section, day_of_week, period_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS calendar_events (
    event_id    INT NOT NULL AUTO_INCREMENT,
    title       VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    event_date  DATE NOT NULL,
    end_date    DATE DEFAULT NULL,
    event_type  ENUM('Holiday','Exam','Event','Meeting','Other') NOT NULL DEFAULT 'Event',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS transport_vehicles (
    vehicle_id     INT NOT NULL AUTO_INCREMENT,
    vehicle_number VARCHAR(30) NOT NULL,
    vehicle_type   ENUM('Bus','Mini Bus','Van') NOT NULL DEFAULT 'Bus',
    model_name     VARCHAR(100) NOT NULL,
    capacity       INT NOT NULL,
    route_name     VARCHAR(100) NOT NULL,
    fitness_expiry DATE DEFAULT NULL,
    status         ENUM('Active','Maintenance','Inactive') NOT NULL DEFAULT 'Active',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vehicle_id),
    UNIQUE KEY uq_vehicle_number (vehicle_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS transport_drivers (
    driver_id      INT NOT NULL AUTO_INCREMENT,
    full_name      VARCHAR(100) NOT NULL,
    phone          VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) NOT NULL,
    vehicle_id     INT DEFAULT NULL,
    status         ENUM('Active','On Route','On Leave') NOT NULL DEFAULT 'Active',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (driver_id),
    UNIQUE KEY uq_license_number (license_number),
    KEY idx_transport_drivers_vehicle_id (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS transport_students (
    enrollment_id     INT NOT NULL AUTO_INCREMENT,
    student_id        INT NOT NULL,
    route_name        VARCHAR(100) NOT NULL,
    pickup_drop_stop  VARCHAR(150) NOT NULL,
    vehicle_id        INT DEFAULT NULL,
    emergency_contact VARCHAR(20) DEFAULT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (enrollment_id),
    UNIQUE KEY uq_transport_student_id (student_id),
    KEY idx_transport_students_vehicle_id (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS school_settings (
    setting_id    INT NOT NULL AUTO_INCREMENT,
    setting_key   VARCHAR(50) NOT NULL,
    setting_value TEXT NOT NULL,
    PRIMARY KEY (setting_id),
    UNIQUE KEY uq_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- STEP 4: Migrate data from school_student
-- =============================================================================

START TRANSACTION;

INSERT INTO school_management.student_details
    (student_id, full_name, date_of_birth, gender, category, blood_group)
SELECT student_id, full_name, date_of_birth, gender, category, blood_group
FROM school_student.student_details;

INSERT INTO school_management.student_personal_details
    (student_id, admission_date, admission_no, aadhar_no_last_four, apaar_no, pen_no, bpl, class, section)
SELECT student_id, admission_date, admission_no, aadhar_no_last_four, apaar_no, pen_no, bpl, class, section
FROM school_student.student_personal_details;

INSERT INTO school_management.student_parent_details
    (student_id, father_name, father_aadhar_last_four, father_phone, mother_name, mother_aadhar_last_four, mother_phone)
SELECT student_id, father_name, father_aadhar_last_four, father_phone, mother_name, mother_aadhar_last_four, mother_phone
FROM school_student.student_parent_details;

INSERT INTO school_management.student_address
    (address_id, student_id, house_no, pincode, street, city, state)
SELECT address_id, student_id, house_no, pincode, street, city, state
FROM school_student.student_address;

COMMIT;

ALTER TABLE school_management.student_details AUTO_INCREMENT = 10210;


-- =============================================================================
-- STEP 5: Migrate data from school_teacher
-- =============================================================================

START TRANSACTION;

INSERT INTO school_management.teacher_details
    (teacher_id, full_name, date_of_birth, gender, category, blood_group, phone, email)
SELECT teacher_id, full_name, date_of_birth, gender, category, blood_group, phone, email
FROM school_teacher.teacher_details;

INSERT INTO school_management.teacher_address
    (teacher_id, house_no, street, city, state, pincode)
SELECT teacher_id, house_no, street, city, state, pincode
FROM school_teacher.teacher_address;

INSERT INTO school_management.teacher_personal_details
    (teacher_id, date_of_joining, joining_no, aadhar_no, qualification, post, cl)
SELECT teacher_id, date_of_joining, joining_no, aadhar_no, qualification, post, cl
FROM school_teacher.teacher_personal_details;

COMMIT;

ALTER TABLE school_management.teacher_details AUTO_INCREMENT = 30;


-- =============================================================================
-- STEP 6: Migrate data from school_admin (FK-dependency order)
-- =============================================================================

-- transport_vehicles (must precede drivers and transport_students)
START TRANSACTION;
INSERT INTO school_management.transport_vehicles
    (vehicle_id, vehicle_number, vehicle_type, model_name, capacity, route_name, fitness_expiry, status, created_at)
SELECT vehicle_id, vehicle_number, vehicle_type, model_name, capacity, route_name, fitness_expiry, status, created_at
FROM school_admin.transport_vehicles;
COMMIT;
ALTER TABLE school_management.transport_vehicles AUTO_INCREMENT = 6;

-- transport_drivers
START TRANSACTION;
INSERT INTO school_management.transport_drivers
    (driver_id, full_name, phone, license_number, vehicle_id, status, created_at)
SELECT driver_id, full_name, phone, license_number, vehicle_id, status, created_at
FROM school_admin.transport_drivers;
COMMIT;
ALTER TABLE school_management.transport_drivers AUTO_INCREMENT = 5;

-- transport_students
START TRANSACTION;
INSERT INTO school_management.transport_students
    (enrollment_id, student_id, route_name, pickup_drop_stop, vehicle_id, emergency_contact, created_at)
SELECT enrollment_id, student_id, route_name, pickup_drop_stop, vehicle_id, emergency_contact, created_at
FROM school_admin.transport_students;
COMMIT;
ALTER TABLE school_management.transport_students AUTO_INCREMENT = 8;

-- exams (must precede exam_results)
START TRANSACTION;
INSERT INTO school_management.exams
    (exam_id, exam_name, class_name, subject, exam_date, max_marks, created_at)
SELECT exam_id, exam_name, class_name, subject, exam_date, max_marks, created_at
FROM school_admin.exams;
COMMIT;
ALTER TABLE school_management.exams AUTO_INCREMENT = 9;

-- exam_results
START TRANSACTION;
INSERT INTO school_management.exam_results
    (result_id, exam_id, student_id, student_name, marks_obtained, grade, created_at)
SELECT result_id, exam_id, student_id, student_name, marks_obtained, grade, created_at
FROM school_admin.exam_results;
COMMIT;
ALTER TABLE school_management.exam_results AUTO_INCREMENT = 6;

-- subjects
START TRANSACTION;
INSERT INTO school_management.subjects
    (subject_id, subject_name, subject_code, class_name, description, created_at)
SELECT subject_id, subject_name, subject_code, class_name, description, created_at
FROM school_admin.subjects;
COMMIT;
ALTER TABLE school_management.subjects AUTO_INCREMENT = 21;

-- attendance
START TRANSACTION;
INSERT INTO school_management.attendance
    (attendance_id, student_id, student_name, class_name, section, date, status, created_at)
SELECT attendance_id, student_id, student_name, class_name, section, date, status, created_at
FROM school_admin.attendance;
COMMIT;
ALTER TABLE school_management.attendance AUTO_INCREMENT = 40;

-- teacher_attendance
START TRANSACTION;
INSERT INTO school_management.teacher_attendance
    (id, teacher_id, teacher_name, post, date, status, time_in, time_out, created_at)
SELECT id, teacher_id, teacher_name, post, date, status, time_in, time_out, created_at
FROM school_admin.teacher_attendance;
COMMIT;
ALTER TABLE school_management.teacher_attendance AUTO_INCREMENT = 24;

-- fee_structure
START TRANSACTION;
INSERT INTO school_management.fee_structure
    (fee_id, class_name, fee_type, amount, academic_year, due_date, created_at)
SELECT fee_id, class_name, fee_type, amount, academic_year, due_date, created_at
FROM school_admin.fee_structure;
COMMIT;
ALTER TABLE school_management.fee_structure AUTO_INCREMENT = 10;

-- fee_payments
START TRANSACTION;
INSERT INTO school_management.fee_payments
    (payment_id, student_id, student_name, class_name, fee_type, amount_paid, payment_date, payment_mode, status, remarks, created_at)
SELECT payment_id, student_id, student_name, class_name, fee_type, amount_paid, payment_date, payment_mode, status, remarks, created_at
FROM school_admin.fee_payments;
COMMIT;
ALTER TABLE school_management.fee_payments AUTO_INCREMENT = 7;

-- notices
START TRANSACTION;
INSERT INTO school_management.notices
    (notice_id, title, content, category, is_active, created_at)
SELECT notice_id, title, content, category, is_active, created_at
FROM school_admin.notices;
COMMIT;
ALTER TABLE school_management.notices AUTO_INCREMENT = 7;

-- timetable
START TRANSACTION;
INSERT INTO school_management.timetable
    (timetable_id, class_name, section, day_of_week, period_number, subject, teacher_name, start_time, end_time, created_at)
SELECT timetable_id, class_name, section, day_of_week, period_number, subject, teacher_name, start_time, end_time, created_at
FROM school_admin.timetable;
COMMIT;
ALTER TABLE school_management.timetable AUTO_INCREMENT = 31;

-- calendar_events
START TRANSACTION;
INSERT INTO school_management.calendar_events
    (event_id, title, description, event_date, end_date, event_type, created_at)
SELECT event_id, title, description, event_date, end_date, event_type, created_at
FROM school_admin.calendar_events;
COMMIT;
ALTER TABLE school_management.calendar_events AUTO_INCREMENT = 7;

-- school_settings
START TRANSACTION;
INSERT INTO school_management.school_settings
    (setting_id, setting_key, setting_value)
SELECT setting_id, setting_key, setting_value
FROM school_admin.school_settings;
COMMIT;
ALTER TABLE school_management.school_settings AUTO_INCREMENT = 16;


-- =============================================================================
-- STEP 7: Add all Foreign Key constraints (after data load)
-- =============================================================================

ALTER TABLE school_management.student_personal_details
    ADD CONSTRAINT fk_personal_student
        FOREIGN KEY (student_id) REFERENCES school_management.student_details(student_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.student_parent_details
    ADD CONSTRAINT fk_parent_student
        FOREIGN KEY (student_id) REFERENCES school_management.student_details(student_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.student_address
    ADD CONSTRAINT fk_address_student
        FOREIGN KEY (student_id) REFERENCES school_management.student_details(student_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.teacher_address
    ADD CONSTRAINT fk_address_teacher
        FOREIGN KEY (teacher_id) REFERENCES school_management.teacher_details(teacher_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.teacher_personal_details
    ADD CONSTRAINT fk_personal_teacher
        FOREIGN KEY (teacher_id) REFERENCES school_management.teacher_details(teacher_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.exam_results
    ADD CONSTRAINT fk_result_exam
        FOREIGN KEY (exam_id) REFERENCES school_management.exams(exam_id)
        ON DELETE CASCADE;

ALTER TABLE school_management.transport_drivers
    ADD CONSTRAINT fk_driver_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES school_management.transport_vehicles(vehicle_id)
        ON DELETE SET NULL;

ALTER TABLE school_management.transport_students
    ADD CONSTRAINT fk_student_transport_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES school_management.transport_vehicles(vehicle_id)
        ON DELETE SET NULL;


-- =============================================================================
-- STEP 8: VERIFICATION REPORT
-- =============================================================================

SELECT
    src.tbl AS source_table,
    src.source_db,
    src.source_count,
    dst.dest_count,
    CASE WHEN src.source_count = dst.dest_count THEN 'MATCH' ELSE 'MISMATCH' END AS status
FROM (
    SELECT 'student_details' AS tbl, 'school_student' AS source_db, COUNT(*) AS source_count FROM school_student.student_details
    UNION ALL SELECT 'student_personal_details', 'school_student', COUNT(*) FROM school_student.student_personal_details
    UNION ALL SELECT 'student_parent_details',   'school_student', COUNT(*) FROM school_student.student_parent_details
    UNION ALL SELECT 'student_address',           'school_student', COUNT(*) FROM school_student.student_address
    UNION ALL SELECT 'teacher_details',           'school_teacher', COUNT(*) FROM school_teacher.teacher_details
    UNION ALL SELECT 'teacher_address',           'school_teacher', COUNT(*) FROM school_teacher.teacher_address
    UNION ALL SELECT 'teacher_personal_details',  'school_teacher', COUNT(*) FROM school_teacher.teacher_personal_details
    UNION ALL SELECT 'attendance',      'school_admin', COUNT(*) FROM school_admin.attendance
    UNION ALL SELECT 'calendar_events', 'school_admin', COUNT(*) FROM school_admin.calendar_events
    UNION ALL SELECT 'exam_results',    'school_admin', COUNT(*) FROM school_admin.exam_results
    UNION ALL SELECT 'exams',           'school_admin', COUNT(*) FROM school_admin.exams
    UNION ALL SELECT 'fee_payments',    'school_admin', COUNT(*) FROM school_admin.fee_payments
    UNION ALL SELECT 'fee_structure',   'school_admin', COUNT(*) FROM school_admin.fee_structure
    UNION ALL SELECT 'notices',         'school_admin', COUNT(*) FROM school_admin.notices
    UNION ALL SELECT 'school_settings', 'school_admin', COUNT(*) FROM school_admin.school_settings
    UNION ALL SELECT 'subjects',        'school_admin', COUNT(*) FROM school_admin.subjects
    UNION ALL SELECT 'teacher_attendance', 'school_admin', COUNT(*) FROM school_admin.teacher_attendance
    UNION ALL SELECT 'timetable',       'school_admin', COUNT(*) FROM school_admin.timetable
    UNION ALL SELECT 'transport_drivers',  'school_admin', COUNT(*) FROM school_admin.transport_drivers
    UNION ALL SELECT 'transport_students', 'school_admin', COUNT(*) FROM school_admin.transport_students
    UNION ALL SELECT 'transport_vehicles', 'school_admin', COUNT(*) FROM school_admin.transport_vehicles
) AS src
JOIN (
    SELECT 'student_details' AS tbl, COUNT(*) AS dest_count FROM school_management.student_details
    UNION ALL SELECT 'student_personal_details', COUNT(*) FROM school_management.student_personal_details
    UNION ALL SELECT 'student_parent_details',   COUNT(*) FROM school_management.student_parent_details
    UNION ALL SELECT 'student_address',          COUNT(*) FROM school_management.student_address
    UNION ALL SELECT 'teacher_details',          COUNT(*) FROM school_management.teacher_details
    UNION ALL SELECT 'teacher_address',          COUNT(*) FROM school_management.teacher_address
    UNION ALL SELECT 'teacher_personal_details', COUNT(*) FROM school_management.teacher_personal_details
    UNION ALL SELECT 'attendance',      COUNT(*) FROM school_management.attendance
    UNION ALL SELECT 'calendar_events', COUNT(*) FROM school_management.calendar_events
    UNION ALL SELECT 'exam_results',    COUNT(*) FROM school_management.exam_results
    UNION ALL SELECT 'exams',           COUNT(*) FROM school_management.exams
    UNION ALL SELECT 'fee_payments',    COUNT(*) FROM school_management.fee_payments
    UNION ALL SELECT 'fee_structure',   COUNT(*) FROM school_management.fee_structure
    UNION ALL SELECT 'notices',         COUNT(*) FROM school_management.notices
    UNION ALL SELECT 'school_settings', COUNT(*) FROM school_management.school_settings
    UNION ALL SELECT 'subjects',        COUNT(*) FROM school_management.subjects
    UNION ALL SELECT 'teacher_attendance', COUNT(*) FROM school_management.teacher_attendance
    UNION ALL SELECT 'timetable',       COUNT(*) FROM school_management.timetable
    UNION ALL SELECT 'transport_drivers',  COUNT(*) FROM school_management.transport_drivers
    UNION ALL SELECT 'transport_students', COUNT(*) FROM school_management.transport_students
    UNION ALL SELECT 'transport_vehicles', COUNT(*) FROM school_management.transport_vehicles
) AS dst USING (tbl)
ORDER BY src.source_db, src.tbl;


-- STEP 9: Spot-checks

SELECT 'Student ID range' AS check_name, MIN(student_id) AS min_id, MAX(student_id) AS max_id, COUNT(*) AS total
FROM school_management.student_details;

SELECT 'Teacher ID range' AS check_name, MIN(teacher_id) AS min_id, MAX(teacher_id) AS max_id, COUNT(*) AS total
FROM school_management.teacher_details;

SELECT table_name, auto_increment
FROM information_schema.tables
WHERE table_schema = 'school_management' AND auto_increment IS NOT NULL
ORDER BY table_name;

SELECT 'school_student intact' AS check_name, COUNT(*) AS count FROM school_student.student_details
UNION ALL SELECT 'school_teacher intact', COUNT(*) FROM school_teacher.teacher_details
UNION ALL SELECT 'school_admin intact', COUNT(*) FROM school_admin.attendance;

-- END OF MIGRATION SCRIPT
