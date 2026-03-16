-- ============================================================
--   VET IAS — Examination Management System
--   database.sql — UPDATED VERSION (March 2026)
--   Run this completely in MySQL Workbench
--   then: python app.py
-- ============================================================

DROP DATABASE IF EXISTS vetias_db;
CREATE DATABASE vetias_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vetias_db;

-- ============================================================
--  TABLE: users
--  Stores ALL login accounts: admin + staff
-- ============================================================
CREATE TABLE users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,                    -- bcrypt hashed
  role       ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  full_name  VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  TABLE: departments
-- ============================================================
CREATE TABLE departments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  short_code VARCHAR(20)  NOT NULL
);

-- ============================================================
--  TABLE: students
-- ============================================================
CREATE TABLE students (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  roll_no     VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  year        YEAR         NOT NULL,
  department  VARCHAR(100) NOT NULL,
  prefix      VARCHAR(20)  NOT NULL,
  phone       VARCHAR(15),
  email       VARCHAR(100),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prefix (prefix),
  INDEX idx_dept   (department)
);

-- ============================================================
--  TABLE: halls  (backticks around `rows` — reserved word)
-- ============================================================
CREATE TABLE halls (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(50) NOT NULL UNIQUE,
  capacity  INT NOT NULL DEFAULT 30,
  `rows`    INT NOT NULL DEFAULT 15,
  cols      INT NOT NULL DEFAULT 2
);

-- ============================================================
--  TABLE: staff_members
-- ============================================================
CREATE TABLE staff_members (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  designation VARCHAR(100),
  phone       VARCHAR(15),
  hall_id     INT,
  user_id     INT,
  FOREIGN KEY (hall_id) REFERENCES halls(id)    ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)    ON DELETE SET NULL
);

-- ============================================================
--  TABLE: exam_sessions
-- ============================================================
CREATE TABLE exam_sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  exam_date    DATE         NOT NULL,
  session      ENUM('FN','AN') NOT NULL DEFAULT 'FN',
  session_start TIME         DEFAULT '09:00:00',       -- ← NEW: start time
  session_end   TIME         DEFAULT '12:00:00',       -- ← NEW: end time
  subject      VARCHAR(150),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  TABLE: hall_allocations
-- ============================================================
CREATE TABLE hall_allocations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT NOT NULL,
  hall_id      INT NOT NULL,
  student_id   INT NOT NULL,
  seat_number  INT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (hall_id)    REFERENCES halls(id)         ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)      ON DELETE CASCADE,
  UNIQUE KEY unique_seat (session_id, hall_id, seat_number),
  INDEX idx_session (session_id),
  INDEX idx_student (student_id)
);

-- ============================================================
--  TABLE: attendance
-- ============================================================
CREATE TABLE attendance (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  status     ENUM('P','A','L','OD') DEFAULT 'A',
  marked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)      ON DELETE CASCADE,
  UNIQUE KEY unique_att (session_id, student_id)
);

-- ============================================================
--  TABLE: malpractice_reports  ← NEW: persist reports in DB
-- ============================================================
CREATE TABLE malpractice_reports (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  session_id  INT NOT NULL,
  student_id  INT NOT NULL,
  reported_by INT,                                     -- user_id of staff
  reason      TEXT NOT NULL,
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id)  REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)  REFERENCES students(id)      ON DELETE CASCADE,
  FOREIGN KEY (reported_by) REFERENCES users(id)         ON DELETE SET NULL
);

-- ============================================================
--  SEED: Users
--  Passwords are set to bcrypt hashes by python app.py on first run.
--  Default credentials:
--    admin  → admin123
--    staff1 → staff123
-- ============================================================
INSERT INTO users (username, password, role, full_name) VALUES
('admin',  'WILL_BE_SET_BY_PYTHON', 'admin', 'Administrator'),
('staff1', 'WILL_BE_SET_BY_PYTHON', 'staff', 'Examination Staff');

-- ============================================================
--  SEED: Departments
-- ============================================================
INSERT INTO departments (name, short_code) VALUES
('Artificial Intelligence & Data Science', 'AID'),
('Computer Science Engineering',           'CSE'),
('Electronics & Communication',            'ECE'),
('Mechanical Engineering',                 'MECH'),
('Civil Engineering',                      'CIVIL');

-- ============================================================
--  SEED: Halls
--  NOTE: Halls are created by the admin via the UI.
--  No default halls are seeded. Admin adds halls from Hall Management.
-- ============================================================
-- (No default halls — admin creates halls from the dashboard)

-- ============================================================
--  SEED: 66 Students — 2024 Batch — AI & Data Science
--  Prefix: 24AID
-- ============================================================
INSERT INTO students (roll_no, name, year, department, prefix) VALUES
('24AID01', 'Abdul Rahuman',              2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID02', 'Adithiyan S',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID03', 'Anurajashree M',             2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID04', 'Balaji S',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID05', 'Barath V',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID07', 'Bhaavanashree M',            2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID09', 'Brindha R',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID10', 'Deepika S',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID11', 'Devisri E',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID12', 'Dhanushiya M',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID13', 'Dhanusri E',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID14', 'Dhanyalakshmi M',            2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID15', 'Dharsan V',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID16', 'Dinesh Karthick S',          2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID17', 'Ela M',                      2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID18', 'Eniya K S',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID19', 'Gayathri R G',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID20', 'Gokila R',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID21', 'Hari Rajan D',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID22', 'Jawahar E J',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID23', 'Jeevan Varma R',             2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID24', 'Joshua Tamilnidhi S',        2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID25', 'Karthik G',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID26', 'Karthika V',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID27', 'Keethana K',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID28', 'Koushika S P',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID29', 'Krishnaraj D',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID30', 'Lipika G',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID31', 'Logeshwaran R',              2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID32', 'Madanika N',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID33', 'Miruthula K',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID34', 'Mohammeed Zameeruddin R',    2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID35', 'Mounika M S',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID36', 'Nagadharshini V',            2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID37', 'Nandhana K S',               2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID38', 'Naveena D',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID39', 'Nidarshana MY',              2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID40', 'Nishanthi S',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID41', 'Nitha Nowrin A',             2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID42', 'Nitya S P',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID43', 'Nowfiya H',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID44', 'Pavithra M',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID45', 'Poornashri M S',             2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID46', 'Priyadharshini S',           2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID47', 'Rajasekar S E',              2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID48', 'Raksha K G',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID49', 'Ravikrishna P',              2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID50', 'Reshma M',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID51', 'Rithan S',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID52', 'Roshini P M',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID53', 'Safiya Bahira M',            2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID54', 'Sahana S',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID55', 'Santhini M',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID56', 'Santhosh Vinayagam S',       2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID57', 'Saran P S',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID58', 'Shahul Hameed Khan M',       2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID59', 'Sowmya R',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID60', 'Sree Arppana K S',           2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID61', 'Sudharsan S',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID62', 'Surya R',                    2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID63', 'Surya R S',                  2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID64', 'Vishal P',                   2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID65', 'Yoganithi P',                2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID66', 'Yuvaraja S',                 2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID67', 'Mohamed Munasar M',          2024, 'Artificial Intelligence & Data Science', '24AID'),
('24AID69', 'Imanuel Caleb S P',          2024, 'Artificial Intelligence & Data Science', '24AID');

-- ============================================================
--  VERIFY — Run this to confirm everything loaded correctly
-- ============================================================
SELECT 'users'               AS table_name, COUNT(*) AS count FROM users
UNION ALL SELECT 'departments',              COUNT(*) FROM departments
UNION ALL SELECT 'halls',                    COUNT(*) FROM halls
UNION ALL SELECT 'staff_members',            COUNT(*) FROM staff_members
UNION ALL SELECT 'students',                 COUNT(*) FROM students
UNION ALL SELECT 'exam_sessions',            COUNT(*) FROM exam_sessions
UNION ALL SELECT 'hall_allocations',         COUNT(*) FROM hall_allocations
UNION ALL SELECT 'attendance',               COUNT(*) FROM attendance
UNION ALL SELECT 'malpractice_reports',      COUNT(*) FROM malpractice_reports;

-- ============================================================
--  DONE — Next step: python app.py
--  Default login: admin / admin123
-- ============================================================
