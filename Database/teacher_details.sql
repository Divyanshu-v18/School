USE school_management;

-- Parent table: teacher_id is generated here and reused by the other tables
CREATE TABLE teacher_details (
    teacher_id    INT PRIMARY KEY AUTO_INCREMENT,
    full_name     VARCHAR(60) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender        ENUM('Male', 'Female', 'Other') NOT NULL,
    category      ENUM('General', 'EWS', 'OBC', 'SC', 'ST', 'Others') NOT NULL,
    blood_group   ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    phone         VARCHAR(10) NOT NULL UNIQUE,
    email         VARCHAR(100) NOT NULL UNIQUE
);

-- One-to-one with teacher_details (no AUTO_INCREMENT here)
CREATE TABLE teacher_address (
    teacher_id INT PRIMARY KEY,
    house_no   VARCHAR(10),
    street     VARCHAR(200) NOT NULL,
    city       VARCHAR(50) NOT NULL,
    state      VARCHAR(50) NOT NULL,
    pincode    CHAR(6) NOT NULL,

    CONSTRAINT fk_address_teacher
        FOREIGN KEY (teacher_id) REFERENCES teacher_details(teacher_id)
        ON DELETE CASCADE
);

-- One-to-one with teacher_details (no AUTO_INCREMENT here)
CREATE TABLE teacher_personal_details (
    teacher_id      INT PRIMARY KEY,
    date_of_joining DATE NOT NULL,
    joining_no      VARCHAR(20) UNIQUE,
    aadhar_no       CHAR(12) NOT NULL UNIQUE,
    qualification   VARCHAR(30) NOT NULL,
    post            VARCHAR(50) NOT NULL,
    cl              INT NOT NULL,  -- TODO: confirm what this stores (e.g. casual leave balance)

    CONSTRAINT fk_personal_teacher
        FOREIGN KEY (teacher_id) REFERENCES teacher_details(teacher_id)
        ON DELETE CASCADE
);
