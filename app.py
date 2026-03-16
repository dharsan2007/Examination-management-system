# ============================================================
#   VET IAS — Examination Management System
#   app.py — VERCEL DEPLOYMENT VERSION
#   Uses PyMySQL (pure Python) + environment variables for DB
# ============================================================

from flask import Flask, request, jsonify, session, render_template
from flask_cors import CORS
import pymysql
import pymysql.cursors
import bcrypt
import os
from functools import wraps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'),
            static_url_path='/static')

app.secret_key = os.environ.get("SECRET_KEY", "vetias_secret_key_change_this_in_production")

CORS(app, supports_credentials=True, origins="*")

# ============================================================
#  DATABASE CONFIG — reads from environment variables
#  Set these in Vercel project settings:
#    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_SSL
# ============================================================
def get_db():
    ssl_ca = os.environ.get("DB_SSL_CA")
    ssl_config = {"ca": ssl_ca} if ssl_ca else None
    conn = pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "vijaydharsan2007"),
        database=os.environ.get("DB_NAME", "vetias_db"),
        port=int(os.environ.get("DB_PORT", "3306")),
        cursorclass=pymysql.cursors.DictCursor,
        ssl=ssl_config,
        connect_timeout=10,
        charset='utf8mb4'
    )
    return conn

# ============================================================
#  SERVE HTML PAGES
# ============================================================
@app.route('/')
def serve_index():
    return render_template('index.html')

@app.route('/output.html')
def serve_output():
    return render_template('output.html')

# ============================================================
#  HELPERS
# ============================================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not logged in"}), 401
        if session.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

# ============================================================
#  SETUP PASSWORDS ON FIRST RUN
# ============================================================
def is_bcrypt(h):
    return bool(h and str(h).startswith('$2b$'))

def setup_passwords():
    try:
        db  = get_db()
        cur = db.cursor()

        cur.execute("SELECT username, password FROM users WHERE role='admin'")
        admins = cur.fetchall()
        for admin in admins:
            if not is_bcrypt(admin['password']):
                h = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
                cur.execute("UPDATE users SET password=%s WHERE username=%s", (h, admin['username']))
                print(f"[OK] Password set for {admin['username']} -> admin123")

        cur.execute("SELECT username, password FROM users WHERE role='staff'")
        all_staff = cur.fetchall()
        for s in all_staff:
            if not is_bcrypt(s['password']):
                h = bcrypt.hashpw(b"staff123", bcrypt.gensalt()).decode()
                cur.execute("UPDATE users SET password=%s WHERE username=%s", (h, s['username']))
                print(f"[OK] Password set for {s['username']} -> staff123")

        db.commit()
        cur.close(); db.close()
        print("[OK] Password setup complete.")
    except Exception as e:
        print(f"[WARN] Password setup error: {e}")

# ============================================================
#  AUTH ROUTES
# ============================================================
@app.route("/api/login", methods=["POST"])
def login():
    data     = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cur.fetchone()
        cur.close(); db.close()
        if not user:
            return jsonify({"error": "Invalid username or password"}), 401
        if bcrypt.checkpw(password.encode(), user["password"].encode()):
            session["user_id"]   = user["id"]
            session["username"]  = user["username"]
            session["role"]      = user["role"]
            session["full_name"] = user["full_name"]
            return jsonify({"message": "Login successful", "role": user["role"], "full_name": user["full_name"]})
        else:
            return jsonify({"error": "Invalid username or password"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})

@app.route("/api/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False}), 401
    return jsonify({
        "logged_in": True,
        "user_id":   session["user_id"],
        "username":  session["username"],
        "role":      session["role"],
        "full_name": session["full_name"]
    })

# ============================================================
#  STUDENTS ROUTES
# ============================================================
@app.route("/api/students", methods=["GET"])
@login_required
def get_students():
    prefix = request.args.get("prefix")
    year   = request.args.get("year")
    dept   = request.args.get("dept")
    query  = "SELECT * FROM students WHERE 1=1"
    params = []
    if prefix: query += " AND prefix = %s";          params.append(prefix)
    if year:   query += " AND year = %s";             params.append(year)
    if dept:   query += " AND department LIKE %s";    params.append(f"%{dept}%")
    query += " ORDER BY roll_no"
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute(query, params)
        students = cur.fetchall()
        cur.close(); db.close()
        return jsonify(students)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/prefixes", methods=["GET"])
def get_prefixes():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT prefix, year, department,
                   COUNT(*)     AS total,
                   MIN(roll_no) AS first_roll,
                   MAX(roll_no) AS last_roll
            FROM students
            GROUP BY prefix, year, department
            ORDER BY prefix
        """)
        rows = cur.fetchall()
        cur.close(); db.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/batch", methods=["GET"])
def get_batch_students():
    prefix = request.args.get("prefix", "")
    start  = int(request.args.get("start", 1))
    end    = int(request.args.get("end", 66))
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT roll_no, name, department, year
            FROM students
            WHERE prefix = %s
              AND CAST(SUBSTRING(roll_no, LENGTH(%s)+1) AS UNSIGNED) >= %s
              AND CAST(SUBSTRING(roll_no, LENGTH(%s)+1) AS UNSIGNED) <= %s
            ORDER BY roll_no
        """, (prefix, prefix, start, prefix, end))
        students = cur.fetchall()
        cur.close(); db.close()
        return jsonify({"prefix": prefix, "start": start, "end": end, "students": students})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/add", methods=["POST"])
@admin_required
def add_student():
    data = request.get_json()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO students (roll_no, name, year, department, prefix, phone, email)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (data["roll_no"], data["name"], data["year"],
              data["department"], data["prefix"],
              data.get("phone",""), data.get("email","")))
        db.commit()
        new_id = cur.lastrowid
        cur.close(); db.close()
        return jsonify({"message": "Student added", "id": new_id})
    except pymysql.err.IntegrityError:
        return jsonify({"error": "Roll number already exists"}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<int:sid>", methods=["DELETE"])
@admin_required
def delete_student(sid):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM students WHERE id = %s", (sid,))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Student deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/students/<int:sid>", methods=["PUT"])
@admin_required
def update_student(sid):
    data = request.get_json()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            UPDATE students SET name=%s, year=%s, department=%s, prefix=%s, phone=%s, email=%s
            WHERE id=%s
        """, (data["name"], data["year"], data["department"],
              data["prefix"], data.get("phone",""), data.get("email",""), sid))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Student updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  HALLS ROUTES
# ============================================================
@app.route("/api/halls", methods=["GET"])
@login_required
def get_halls():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM halls ORDER BY name")
        halls = cur.fetchall()
        cur.close(); db.close()
        return jsonify(halls)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/halls/add", methods=["POST"])
@admin_required
def add_hall():
    data = request.get_json()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO halls (name, capacity, `rows`, cols)
            VALUES (%s, %s, %s, %s)
        """, (data["name"], data["capacity"], data.get("rows", 15), data.get("cols", 2)))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Hall added"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/halls/<int:hid>", methods=["DELETE"])
@admin_required
def delete_hall(hid):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM halls WHERE id = %s", (hid,))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Hall deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/halls/<int:hid>", methods=["PUT"])
@admin_required
def update_hall(hid):
    data = request.get_json()
    rows = data.get("rows", 6)
    cols = data.get("cols", 10)
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            UPDATE halls SET name=%s, capacity=%s, `rows`=%s, cols=%s WHERE id=%s
        """, (data["name"], rows * cols, rows, cols, hid))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Hall updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  STAFF ROUTES
# ============================================================
@app.route("/api/staff", methods=["GET"])
@login_required
def get_staff():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT s.id, s.name, s.designation, s.phone, s.hall_id,
                   h.name AS hall_name,
                   u.username, u.id AS user_id
            FROM staff_members s
            LEFT JOIN halls h ON s.hall_id = h.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.name
        """)
        staff = cur.fetchall()
        cur.close(); db.close()
        return jsonify(staff)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/staff/add", methods=["POST"])
@admin_required
def add_staff():
    data        = request.get_json()
    username    = data.get("username", "").strip()
    password    = data.get("password", "").strip()
    full_name   = data.get("name", username).strip() or username
    designation = data.get("designation", "").strip()
    hall_id     = data.get("hall_id") or None

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    try:
        db  = get_db()
        cur = db.cursor()

        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close(); db.close()
            return jsonify({"error": "Username already exists"}), 409

        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("""
            INSERT INTO users (username, password, role, full_name)
            VALUES (%s, %s, 'staff', %s)
        """, (username, hashed, full_name))
        db.commit()
        user_id = cur.lastrowid

        cur.execute("""
            INSERT INTO staff_members (name, designation, user_id, hall_id)
            VALUES (%s, %s, %s, %s)
        """, (full_name, designation, user_id, hall_id))
        db.commit()
        staff_id = cur.lastrowid

        cur.close(); db.close()
        return jsonify({"message": "Staff added", "id": staff_id, "user_id": user_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/staff/<int:sid>", methods=["DELETE"])
@admin_required
def delete_staff(sid):
    try:
        db  = get_db()
        cur = db.cursor()

        cur.execute("SELECT user_id FROM staff_members WHERE id = %s", (sid,))
        row = cur.fetchone()
        if not row:
            cur.close(); db.close()
            return jsonify({"error": "Staff not found"}), 404

        user_id = row["user_id"]

        cur.execute("DELETE FROM staff_members WHERE id = %s", (sid,))
        db.commit()

        if user_id:
            cur.execute("DELETE FROM users WHERE id = %s AND role = 'staff'", (user_id,))
            db.commit()

        cur.close(); db.close()
        return jsonify({"message": "Staff deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/staff/<int:sid>/password", methods=["PUT"])
@admin_required
def update_staff_password(sid):
    data = request.get_json()
    password = data.get("password", "").strip()
    if not password:
        return jsonify({"error": "Password required"}), 400
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT user_id FROM staff_members WHERE id = %s", (sid,))
        row = cur.fetchone()
        if not row:
            cur.close(); db.close()
            return jsonify({"error": "Staff not found"}), 404
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("UPDATE users SET password = %s WHERE id = %s", (hashed, row["user_id"]))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Password updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/staff/<int:sid>/hall", methods=["PUT"])
@admin_required
def assign_hall_to_staff(sid):
    data    = request.get_json()
    hall_id = data.get("hall_id") or None
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("UPDATE staff_members SET hall_id = %s WHERE id = %s", (hall_id, sid))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Hall assigned"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  EXAM SESSION + ALLOCATION ROUTES
# ============================================================
@app.route("/api/sessions", methods=["GET"])
@login_required
def get_sessions():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM exam_sessions ORDER BY exam_date DESC, session")
        sessions = cur.fetchall()
        for s in sessions:
            if s.get('exam_date'):     s['exam_date']     = str(s['exam_date'])
            if s.get('created_at'):    s['created_at']    = str(s['created_at'])
            if s.get('session_start'): s['session_start'] = str(s['session_start'])
            if s.get('session_end'):   s['session_end']   = str(s['session_end'])
        cur.close(); db.close()
        return jsonify(sessions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sessions/<int:sid>", methods=["DELETE"])
@admin_required
def delete_session(sid):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM exam_sessions WHERE id = %s", (sid,))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Session deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sessions/create", methods=["POST"])
@admin_required
def create_session():
    data = request.get_json()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO exam_sessions (exam_date, session, session_start, session_end, subject)
            VALUES (%s, %s, %s, %s, %s)
        """, (data["exam_date"], data.get("session","FN"),
              data.get("session_start", "09:00:00"),
              data.get("session_end",   "12:00:00"),
              data.get("subject","")))
        db.commit()
        sid = cur.lastrowid
        cur.close(); db.close()
        return jsonify({"message": "Session created", "id": sid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/allocate", methods=["POST"])
@admin_required
def allocate_students():
    data        = request.get_json()
    session_id  = data["session_id"]
    assignments = data["hall_assignments"]
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM hall_allocations WHERE session_id = %s", (session_id,))
        for asgn in assignments:
            hall_id = asgn["hall_id"]
            prefix  = asgn["prefix"]
            start   = int(asgn["start"])
            end     = int(asgn["end"])
            cur.execute("""
                SELECT id FROM students
                WHERE prefix = %s ORDER BY roll_no
                LIMIT %s OFFSET %s
            """, (prefix, end - start + 1, start - 1))
            students = cur.fetchall()
            for i, stu in enumerate(students, 1):
                cur.execute("""
                    INSERT INTO hall_allocations (session_id, hall_id, student_id, seat_number)
                    VALUES (%s, %s, %s, %s)
                """, (session_id, hall_id, stu["id"], i))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Allocation done"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/seating/<int:session_id>", methods=["GET"])
@login_required
def get_seating(session_id):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT ha.seat_number, ha.hall_id, h.name AS hall_name,
                   s.roll_no, s.name AS student_name, s.department, s.prefix
            FROM hall_allocations ha
            JOIN students s ON ha.student_id = s.id
            JOIN halls h    ON ha.hall_id    = h.id
            WHERE ha.session_id = %s
            ORDER BY ha.hall_id, ha.seat_number
        """, (session_id,))
        rows = cur.fetchall()
        cur.close(); db.close()
        halls = {}
        for row in rows:
            hname = row["hall_name"]
            if hname not in halls:
                halls[hname] = {"hall_id": row["hall_id"], "seats": []}
            halls[hname]["seats"].append({
                "seat": row["seat_number"], "roll_no": row["roll_no"],
                "name": row["student_name"], "department": row["department"]
            })
        return jsonify(halls)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  ATTENDANCE ROUTES
# ============================================================
@app.route("/api/attendance/mark", methods=["POST"])
@login_required
def mark_attendance():
    data = request.get_json()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO attendance (session_id, student_id, status)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE status = VALUES(status), marked_at = NOW()
        """, (data["session_id"], data["student_id"], data["status"]))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Attendance marked"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/attendance/<int:session_id>", methods=["GET"])
@login_required
def get_attendance(session_id):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT a.student_id, a.status, s.roll_no, s.name,
                   s.department, h.name AS hall_name
            FROM attendance a
            JOIN students s          ON a.student_id  = s.id
            JOIN hall_allocations ha ON (ha.student_id = a.student_id AND ha.session_id = a.session_id)
            JOIN halls h             ON ha.hall_id     = h.id
            WHERE a.session_id = %s
            ORDER BY s.roll_no
        """, (session_id,))
        rows = cur.fetchall()
        cur.close(); db.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/attendance/summary/<int:session_id>", methods=["GET"])
@login_required
def attendance_summary(session_id):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT status, COUNT(*) AS count FROM attendance
            WHERE session_id = %s GROUP BY status
        """, (session_id,))
        rows = cur.fetchall()
        cur.close(); db.close()
        summary = {"P": 0, "A": 0, "L": 0, "OD": 0}
        for row in rows:
            summary[row["status"]] = row["count"]
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  DASHBOARD STATS
# ============================================================
@app.route("/api/stats", methods=["GET"])
@login_required
def get_stats():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT COUNT(*) AS total FROM students")
        s = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) AS total FROM halls")
        h = cur.fetchone()["total"]
        cur.execute("SELECT COALESCE(SUM(capacity), 0) AS total FROM halls")
        cap = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) AS total FROM staff_members")
        st = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) AS total FROM exam_sessions")
        ses = cur.fetchone()["total"]
        cur.execute("SELECT id FROM exam_sessions ORDER BY created_at DESC LIMIT 1")
        latest = cur.fetchone()
        allocated = 0
        incidents = 0
        if latest:
            sid = latest["id"]
            cur.execute("SELECT COUNT(*) AS total FROM hall_allocations WHERE session_id = %s", (sid,))
            allocated = cur.fetchone()["total"]
            cur.execute("SELECT COUNT(*) AS total FROM malpractice_reports WHERE session_id = %s", (sid,))
            incidents = cur.fetchone()["total"]
        cur.close(); db.close()
        return jsonify({
            "students":  s,
            "halls":     h,
            "capacity":  int(cap),
            "staff":     st,
            "sessions":  ses,
            "allocated": allocated,
            "incidents": incidents
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  DEPARTMENTS
# ============================================================
@app.route("/api/departments", methods=["GET"])
def get_departments():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM departments ORDER BY name")
        depts = cur.fetchall()
        cur.close(); db.close()
        return jsonify(depts)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  ADMIN MANAGEMENT ROUTES
# ============================================================
@app.route("/api/admins", methods=["GET"])
@admin_required
def get_admins():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT id, username, full_name, created_at FROM users WHERE role='admin' ORDER BY created_at")
        admins = cur.fetchall()
        for a in admins:
            if a.get('created_at'):
                a['created_at'] = str(a['created_at'])
        cur.close(); db.close()
        return jsonify(admins)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admins/add", methods=["POST"])
@admin_required
def add_admin():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close(); db.close()
            return jsonify({"error": "Username already exists"}), 409
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("""
            INSERT INTO users (username, password, role, full_name)
            VALUES (%s, %s, 'admin', %s)
        """, (username, hashed, username))
        db.commit()
        new_id = cur.lastrowid
        cur.close(); db.close()
        return jsonify({"message": "Admin added", "id": new_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admins/<int:aid>", methods=["DELETE"])
@admin_required
def delete_admin(aid):
    if aid == session.get("user_id"):
        return jsonify({"error": "Cannot delete your own account"}), 400
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT username FROM users WHERE id = %s AND role = 'admin'", (aid,))
        user = cur.fetchone()
        if not user:
            cur.close(); db.close()
            return jsonify({"error": "Admin not found"}), 404
        if user["username"] == "admin":
            cur.close(); db.close()
            return jsonify({"error": "Cannot delete the default admin account"}), 400
        cur.execute("DELETE FROM users WHERE id = %s AND role = 'admin'", (aid,))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Admin deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  CHANGE PASSWORD
# ============================================================
@app.route("/api/users/change-password", methods=["POST"])
@login_required
def change_password():
    data     = request.get_json()
    old_pass = data.get("old_password", "")
    new_pass = data.get("new_password", "")
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT password FROM users WHERE id = %s", (session["user_id"],))
        user = cur.fetchone()
        if not bcrypt.checkpw(old_pass.encode(), user["password"].encode()):
            return jsonify({"error": "Old password is incorrect"}), 400
        new_hash = bcrypt.hashpw(new_pass.encode(), bcrypt.gensalt()).decode()
        cur.execute("UPDATE users SET password = %s WHERE id = %s", (new_hash, session["user_id"]))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Password changed successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  MALPRACTICE ROUTES
# ============================================================
@app.route("/api/malpractice", methods=["POST"])
@login_required
def add_malpractice():
    body = request.get_json()
    session_id = body.get("session_id")
    roll_no    = body.get("roll_no", "").strip()
    reason     = body.get("reason", "").strip()
    if not roll_no or not reason:
        return jsonify({"error": "roll_no and reason required"}), 400
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT id FROM students WHERE roll_no = %s", (roll_no,))
        stu = cur.fetchone()
        if not stu:
            cur.close(); db.close()
            return jsonify({"error": f"Student '{roll_no}' not found"}), 404
        if not session_id:
            cur.execute("SELECT id FROM exam_sessions ORDER BY created_at DESC LIMIT 1")
            row = cur.fetchone()
            session_id = row["id"] if row else None
        if not session_id:
            cur.close(); db.close()
            return jsonify({"error": "No exam session exists. Create a session first."}), 400
        cur.execute("""
            INSERT INTO malpractice_reports (session_id, student_id, reported_by, reason)
            VALUES (%s, %s, %s, %s)
        """, (session_id, stu["id"], session.get("user_id"), reason))
        db.commit()
        new_id = cur.lastrowid
        cur.close(); db.close()
        return jsonify({"message": "Report filed", "id": new_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/malpractice/session/<int:session_id>", methods=["GET"])
@login_required
def get_malpractice(session_id):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT mr.id, mr.reason, mr.reported_at,
                   s.roll_no, s.name AS student_name,
                   u.username AS reported_by
            FROM malpractice_reports mr
            JOIN students s  ON mr.student_id  = s.id
            LEFT JOIN users u ON mr.reported_by = u.id
            WHERE mr.session_id = %s
            ORDER BY mr.reported_at DESC
        """, (session_id,))
        rows = cur.fetchall()
        for r in rows:
            if r.get('reported_at'): r['reported_at'] = str(r['reported_at'])
        cur.close(); db.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/malpractice/<int:rid>", methods=["DELETE"])
@login_required
def delete_malpractice(rid):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM malpractice_reports WHERE id = %s", (rid,))
        db.commit()
        cur.close(); db.close()
        return jsonify({"message": "Report deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================
#  START SERVER (local dev only — Vercel uses WSGI directly)
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  VET IAS - Examination Management System")
    print("  Open: http://localhost:5000")
    print("=" * 60)
    setup_passwords()
    app.run(debug=True, host="0.0.0.0", port=5000)