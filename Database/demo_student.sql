
USE school_management;

-- 1. Prepare a temporary list of demo students
DROP TEMPORARY TABLE IF EXISTS seed_students;

CREATE TEMPORARY TABLE seed_students (
    row_num INT PRIMARY KEY,
    full_name VARCHAR(60) NOT NULL UNIQUE,
    class_name VARCHAR(10) NOT NULL,
    section_name CHAR(1) NOT NULL,
    class_order INT NOT NULL
);

INSERT INTO seed_students
    (row_num, full_name, class_name, section_name, class_order)
WITH class_list AS (
    SELECT 1 AS class_order, 'KidsCare' AS display_name, 'KIDSCARE' AS class_value
    UNION ALL SELECT 2, 'NUR', 'NUR'
    UNION ALL SELECT 3, 'LKG', 'LKG'
    UNION ALL SELECT 4, 'UKG', 'UKG'
    UNION ALL SELECT 5, '1', '1'
    UNION ALL SELECT 6, '2', '2'
    UNION ALL SELECT 7, '3', '3'
    UNION ALL SELECT 8, '4', '4'
    UNION ALL SELECT 9, '5', '5'
    UNION ALL SELECT 10, '6', '6'
    UNION ALL SELECT 11, '7', '7'
    UNION ALL SELECT 12, '8', '8'
    UNION ALL SELECT 13, '9', '9'
    UNION ALL SELECT 14, '10', '10'
    UNION ALL SELECT 15, '11', '11'
    UNION ALL SELECT 16, '12', '12'
),
section_list AS (
    SELECT 'A' AS section_name
    UNION ALL SELECT 'B'
    UNION ALL SELECT 'C'
    UNION ALL SELECT 'D'
),
combinations AS (
    SELECT
        ROW_NUMBER() OVER (
            ORDER BY c.class_order, s.section_name
        ) AS row_num,
        c.display_name,
        c.class_value,
        c.class_order,
        s.section_name
    FROM class_list c
    CROSS JOIN section_list s
)
SELECT
    row_num,
    CONCAT('Demo ', display_name, ' ', section_name),
    class_value,
    section_name,
    class_order
FROM combinations;

-- 2. Insert the records into all four permanent tables
START TRANSACTION;

-- Basic student details
INSERT INTO student_details (
    full_name, date_of_birth, gender, category, blood_group
)
SELECT
    full_name,
    DATE_SUB(CURDATE(), INTERVAL (class_order + 2) YEAR),
    CASE WHEN MOD(row_num, 2) = 0 THEN 'Female' ELSE 'Male' END,
    'General',
    'B+'
FROM seed_students;

-- Admission and class details
INSERT INTO student_personal_details (
    student_id, admission_date, admission_no,
    aadhar_no_last_four, apaar_no, pen_no,
    bpl, `class`, section
)
SELECT
    d.student_id,
    CURDATE(),
    CONCAT('DEMO2026-', LPAD(s.row_num, 4, '0')),
    LPAD(7000 + s.row_num, 4, '0'),
    LPAD(300000000000 + s.row_num, 12, '0'),
    CONCAT('DEMO-PEN-', LPAD(s.row_num, 4, '0')),
    'NO',
    s.class_name,
    s.section_name
FROM seed_students s
JOIN student_details d
    ON d.full_name = s.full_name;

-- Parent details
INSERT INTO student_parent_details (
    student_id, father_name, father_aadhar_last_four,
    father_phone, mother_name, mother_aadhar_last_four, mother_phone
)
SELECT
    d.student_id,
    CONCAT('Demo Father ', s.row_num),
    LPAD(5000 + s.row_num, 4, '0'),
    NULL,
    CONCAT('Demo Mother ', s.row_num),
    LPAD(6000 + s.row_num, 4, '0'),
    NULL
FROM seed_students s
JOIN student_details d
    ON d.full_name = s.full_name;

-- Address details
INSERT INTO student_address (
    address_id, student_id, house_no, pincode,
    street, city, state
)
SELECT
    d.student_id,
    d.student_id,
    CONCAT('H-', s.row_num),
    '110001',
    CONCAT('Demo Street ', s.row_num),
    'Demo City',
    'Demo State'
FROM seed_students s
JOIN student_details d
    ON d.full_name = s.full_name;

COMMIT;

-- 3. Verify the inserted students
SELECT
    d.student_id,
    d.full_name,
    p.`class`,
    p.section,
    p.admission_no
FROM student_details d
JOIN student_personal_details p
    ON p.student_id = d.student_id
WHERE d.full_name LIKE 'Demo %'
ORDER BY p.student_id;
