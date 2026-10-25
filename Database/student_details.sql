CREATE DATABASE IF NOT EXISTS school_management;

USE school_management;

CREATE TABLE student_details (
    student_id    INT PRIMARY KEY AUTO_INCREMENT,
    full_name     VARCHAR(60) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender        ENUM('Male', 'Female', 'Other') NOT NULL,
    category      ENUM('General', 'EWS', 'OBC', 'SC', 'ST', 'Others') NOT NULL,
    blood_group   ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL
);

ALTER TABLE student_details AUTO_INCREMENT = 10000;


CREATE TABLE student_personal_details (
    student_id          INT PRIMARY KEY,
    admission_date      DATE NOT NULL,
    admission_no        VARCHAR(20) UNIQUE NOT NULL,
    aadhar_no_last_four CHAR(4) UNIQUE NOT NULL,
    apaar_no            CHAR(12) UNIQUE NOT NULL,
    pen_no              VARCHAR(20) UNIQUE NOT NULL,
    bpl                  ENUM('YES', 'NO') NOT NULL,
    class                ENUM('NUR', 'LKG', 'UKG', '1', '2', '3', '4', '5',
                               '6', '7', '8', '9', '10', '11', '12'),
    section              ENUM('A', 'B', 'C', 'D'),

    CONSTRAINT fk_personal_student
        FOREIGN KEY (student_id)
        REFERENCES student_details(student_id)
        ON DELETE CASCADE
);


CREATE TABLE student_parent_details (
    student_id                INT PRIMARY KEY,

    father_name               VARCHAR(60) NOT NULL,
    father_aadhar_last_four   CHAR(4) UNIQUE NOT NULL,
    father_phone              VARCHAR(10),

    mother_name               VARCHAR(60) NOT NULL,
    mother_aadhar_last_four   CHAR(4) UNIQUE NOT NULL,
    mother_phone              VARCHAR(10),

    CONSTRAINT fk_parent_student
        FOREIGN KEY (student_id)
        REFERENCES student_details(student_id)
        ON DELETE CASCADE
);


CREATE TABLE student_address (
    address_id INT PRIMARY KEY,
    student_id INT NOT NULL,
    house_no   VARCHAR(10),
    pincode    CHAR(6) NOT NULL,
    street     VARCHAR(200) NOT NULL,
    city       VARCHAR(50) NOT NULL,
    state      VARCHAR(50) NOT NULL,

    CONSTRAINT fk_address_student
        FOREIGN KEY (student_id)
        REFERENCES student_details(student_id)
        ON DELETE CASCADE
);

USE school_management;

ALTER TABLE student_personal_details
MODIFY COLUMN class ENUM(
    'KIDSCARE',
    'NUR',
    'LKG',
    'UKG',
    '1', '2', '3', '4', '5', '6',
    '7', '8', '9', '10', '11', '12'
);
