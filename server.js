const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");

// Thư viện đăng nhập và phân quyền
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/* ================= MIDDLEWARE JWT ================= */

// Kiểm tra người dùng đã đăng nhập hay chưa
function xacThucToken(req, res, next) {

    const authHeader = req.headers.authorization;

    // Lấy Token từ Header
    const token = authHeader && authHeader.split(" ")[1];

    // Không có Token
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Bạn chưa đăng nhập. Vui lòng đăng nhập!"
        });
    }

    try {
        // Xác thực Token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Lưu thông tin người dùng vào request
        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.name === "TokenExpiredError"
                ? "Phiên đăng nhập đã hết hạn."
                : "Token không hợp lệ."
        });
    }
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend Quan Ly Khach San dang hoat dong!"
  });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT DATABASE() AS database_name");
    res.json({
      success: true,
      message: "Ket noi MySQL thanh cong!",
      database: rows[0].database_name
    });
  } catch (error) {
    console.error("Loi ket noi MySQL:", error.message);
    res.status(500).json({
      success: false,
      message: "Khong the ket noi MySQL",
      error: error.message
    });
  }
});

/* ================= API PHÒNG ================= */

const TRANG_THAI_HOP_LE = ["SAN_SANG", "DANG_SU_DUNG", "DA_DAT", "BAO_TRI"];

// Lấy danh sách phòng
app.get("/api/phong", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.so_phong AS number,
             lp.ten_loai_phong AS type,
             p.tang AS floor,
             p.gia_phong AS price,
             p.trang_thai_van_hanh AS status
      FROM phong p
      JOIN loai_phong lp ON lp.ma_loai_phong = p.ma_loai_phong
      ORDER BY p.so_phong
    `);
    res.json(rows);
  } catch (error) {
    console.error("Loi lay phong:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách phòng." });
  }
});

// Kiểm tra dữ liệu gửi lên
function kiemTraPhong(body) {
  const { number, type, floor, price, status } = body;
  if (!number || !type || !floor || price === "" || price === undefined) {
    return "Thiếu thông tin phòng.";
  }
  if (Number(price) < 0 || Number(floor) < 1) {
    return "Giá hoặc tầng không hợp lệ.";
  }
  if (!TRANG_THAI_HOP_LE.includes(status)) {
    return "Trạng thái phòng không hợp lệ.";
  }
  return null;
}

// Thêm phòng
app.post("/api/phong", async (req, res) => {
  const loi = kiemTraPhong(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { number, type, floor, price, status } = req.body;

  try {
    const [loai] = await db.query(
      "SELECT ma_loai_phong FROM loai_phong WHERE ten_loai_phong = ?",
      [type]
    );
    if (loai.length === 0) {
      return res.status(400).json({ message: "Loại phòng không tồn tại." });
    }

    await db.query(
      `INSERT INTO phong (ma_loai_phong, so_phong, tang, gia_phong, trang_thai_van_hanh)
       VALUES (?, ?, ?, ?, ?)`,
      [loai[0].ma_loai_phong, number, floor, price, status]
    );
    res.status(201).json({ message: "Đã thêm phòng." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Số phòng này đã tồn tại." });
    }
    console.error("Loi them phong:", error.message);
    res.status(500).json({ message: "Không thể thêm phòng." });
  }
});

// Sửa phòng (định danh bằng số phòng cũ)
app.put("/api/phong/:soPhong", async (req, res) => {
  const loi = kiemTraPhong(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { number, type, floor, price, status } = req.body;

  try {
    const [loai] = await db.query(
      "SELECT ma_loai_phong FROM loai_phong WHERE ten_loai_phong = ?",
      [type]
    );
    if (loai.length === 0) {
      return res.status(400).json({ message: "Loại phòng không tồn tại." });
    }

    const [kq] = await db.query(
      `UPDATE phong
       SET ma_loai_phong = ?, so_phong = ?, tang = ?, gia_phong = ?, trang_thai_van_hanh = ?
       WHERE so_phong = ?`,
      [loai[0].ma_loai_phong, number, floor, price, status, req.params.soPhong]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy phòng." });
    }
    res.json({ message: "Đã cập nhật phòng." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Số phòng này đã tồn tại." });
    }
    console.error("Loi sua phong:", error.message);
    res.status(500).json({ message: "Không thể cập nhật phòng." });
  }
});

// Xóa phòng
app.delete("/api/phong/:soPhong", async (req, res) => {
  try {
    const [kq] = await db.query(
      "DELETE FROM phong WHERE so_phong = ?",
      [req.params.soPhong]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy phòng." });
    }
    res.json({ message: "Đã xóa phòng." });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Phòng đã có lịch sử đặt phòng nên không thể xóa."
      });
    }
    console.error("Loi xoa phong:", error.message);
    res.status(500).json({ message: "Không thể xóa phòng." });
  }
});
/* ================= API KHÁCH HÀNG ================= */

const KH_COLUMNS = `
  ma_khach_hang AS id,
  ho_ten AS name,
  so_giay_to AS identity,
  so_dien_thoai AS phone,
  IFNULL(email, '') AS email
`;

function kiemTraKhachHang(body) {
  const { name, identity, phone, email } = body;
  if (!name || !identity || !phone) {
    return "Vui lòng nhập đầy đủ thông tin bắt buộc.";
  }
  if (!/^[0-9]{9,15}$/.test(phone)) {
    return "Số điện thoại phải có từ 9 đến 15 chữ số.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Địa chỉ email chưa hợp lệ.";
  }
  return null;
}

// Lấy danh sách khách hàng
app.get("/api/khach-hang", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${KH_COLUMNS} FROM khach_hang ORDER BY ma_khach_hang`
    );
    res.json(rows);
  } catch (error) {
    console.error("Loi lay khach hang:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách khách hàng." });
  }
});

// Thêm khách hàng
app.post("/api/khach-hang", async (req, res) => {
  const loi = kiemTraKhachHang(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { name, identity, phone, email } = req.body;

  try {
    await db.query(
      `INSERT INTO khach_hang (ho_ten, so_giay_to, so_dien_thoai, email)
       VALUES (?, ?, ?, ?)`,
      [name, identity, phone, email || null]
    );
    res.status(201).json({ message: "Đã thêm khách hàng." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Số giấy tờ đã tồn tại trong danh sách." });
    }
    console.error("Loi them khach hang:", error.message);
    res.status(500).json({ message: "Không thể thêm khách hàng." });
  }
});

// Sửa khách hàng
app.put("/api/khach-hang/:id", async (req, res) => {
  const loi = kiemTraKhachHang(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { name, identity, phone, email } = req.body;

  try {
    const [kq] = await db.query(
      `UPDATE khach_hang
       SET ho_ten = ?, so_giay_to = ?, so_dien_thoai = ?, email = ?
       WHERE ma_khach_hang = ?`,
      [name, identity, phone, email || null, req.params.id]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    }
    res.json({ message: "Đã cập nhật khách hàng." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Số giấy tờ đã tồn tại trong danh sách." });
    }
    console.error("Loi sua khach hang:", error.message);
    res.status(500).json({ message: "Không thể cập nhật khách hàng." });
  }
});

// Xóa khách hàng
app.delete("/api/khach-hang/:id", async (req, res) => {
  try {
    const [kq] = await db.query(
      "DELETE FROM khach_hang WHERE ma_khach_hang = ?",
      [req.params.id]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    }
    res.json({ message: "Đã xóa khách hàng." });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Khách hàng đã có lịch sử đặt phòng nên không thể xóa."
      });
    }
    console.error("Loi xoa khach hang:", error.message);
    res.status(500).json({ message: "Không thể xóa khách hàng." });
  }
});
/* ================= API DỊCH VỤ ================= */

const DV_COLUMNS = `
  ma_dich_vu AS id,
  CONCAT('DV', LPAD(ma_dich_vu, 3, '0')) AS ma,
  ten_dich_vu AS ten,
  don_vi_tinh AS donVi,
  don_gia AS donGia,
  IF(trang_thai = 1, 'active', 'inactive') AS trangThai
`;

function kiemTraDichVu(body) {
  const { ten, donVi, donGia, trangThai } = body;
  if (!ten || !donVi) return "Vui lòng nhập đầy đủ tên dịch vụ và đơn vị tính.";
  if (!Number.isFinite(Number(donGia)) || Number(donGia) <= 0) {
    return "Đơn giá phải lớn hơn 0.";
  }
  if (!["active", "inactive"].includes(trangThai)) {
    return "Trạng thái không hợp lệ.";
  }
  return null;
}

app.get("/api/dich-vu", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${DV_COLUMNS} FROM dich_vu ORDER BY ma_dich_vu`
    );
    res.json(rows);
  } catch (error) {
    console.error("Loi lay dich vu:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách dịch vụ." });
  }
});

app.post("/api/dich-vu", async (req, res) => {
  const loi = kiemTraDichVu(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { ten, donVi, donGia, trangThai } = req.body;

  try {
    const [trung] = await db.query(
      "SELECT ma_dich_vu FROM dich_vu WHERE ten_dich_vu = ?",
      [ten]
    );
    if (trung.length > 0) {
      return res.status(409).json({ message: "Tên dịch vụ đã tồn tại. Vui lòng nhập tên khác." });
    }

    await db.query(
      `INSERT INTO dich_vu (ten_dich_vu, don_vi_tinh, don_gia, trang_thai)
       VALUES (?, ?, ?, ?)`,
      [ten, donVi, donGia, trangThai === "active" ? 1 : 0]
    );
    res.status(201).json({ message: "Thêm dịch vụ thành công." });
  } catch (error) {
    console.error("Loi them dich vu:", error.message);
    res.status(500).json({ message: "Không thể thêm dịch vụ." });
  }
});

app.put("/api/dich-vu/:id", async (req, res) => {
  const loi = kiemTraDichVu(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { ten, donVi, donGia, trangThai } = req.body;

  try {
    const [trung] = await db.query(
      "SELECT ma_dich_vu FROM dich_vu WHERE ten_dich_vu = ? AND ma_dich_vu <> ?",
      [ten, req.params.id]
    );
    if (trung.length > 0) {
      return res.status(409).json({ message: "Tên dịch vụ đã tồn tại. Vui lòng nhập tên khác." });
    }

    const [kq] = await db.query(
      `UPDATE dich_vu
       SET ten_dich_vu = ?, don_vi_tinh = ?, don_gia = ?, trang_thai = ?
       WHERE ma_dich_vu = ?`,
      [ten, donVi, donGia, trangThai === "active" ? 1 : 0, req.params.id]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy dịch vụ." });
    }
    res.json({ message: "Cập nhật dịch vụ thành công." });
  } catch (error) {
    console.error("Loi sua dich vu:", error.message);
    res.status(500).json({ message: "Không thể cập nhật dịch vụ." });
  }
});

app.delete("/api/dich-vu/:id", async (req, res) => {
  try {
    const [dung] = await db.query(
      "SELECT COUNT(*) AS soLan FROM su_dung_dich_vu WHERE ma_dich_vu = ?",
      [req.params.id]
    );

    // Dịch vụ đã từng được dùng: chuyển sang ngừng hoạt động để giữ lịch sử
    if (dung[0].soLan > 0) {
      await db.query("UPDATE dich_vu SET trang_thai = 0 WHERE ma_dich_vu = ?", [req.params.id]);
      return res.json({
        message: "Dịch vụ đã có lịch sử sử dụng nên được chuyển sang 'Ngừng hoạt động' thay vì xóa."
      });
    }

    const [kq] = await db.query("DELETE FROM dich_vu WHERE ma_dich_vu = ?", [req.params.id]);
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy dịch vụ." });
    }
    res.json({ message: "Đã xóa dịch vụ." });
  } catch (error) {
    console.error("Loi xoa dich vu:", error.message);
    res.status(500).json({ message: "Không thể xóa dịch vụ." });
  }
});

/* ================= API NHÂN VIÊN ================= */

const NV_COLUMNS = `
  ma_nhan_vien AS id,
  CONCAT('NV', LPAD(ma_nhan_vien, 3, '0')) AS ma,
  ho_ten AS ten,
  so_dien_thoai AS dienThoai,
  IFNULL(email, '') AS email,
  IFNULL(chuc_vu, '') AS chucVu,
  IFNULL(DATE_FORMAT(ngay_vao_lam, '%Y-%m-%d'), '') AS ngayVaoLam,
  IF(trang_thai = 1, 'Đang làm việc', 'Đã nghỉ') AS trangThai
`;

function kiemTraNhanVien(body) {
  const { ten, dienThoai, email, chucVu, ngayVaoLam, trangThai } = body;
  if (!ten || !dienThoai || !email || !chucVu || !ngayVaoLam) {
    return "Vui lòng nhập đầy đủ thông tin bắt buộc.";
  }
  if (!/^[0-9+ ]{9,15}$/.test(dienThoai)) {
    return "Số điện thoại không hợp lệ.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Địa chỉ email chưa hợp lệ.";
  }
  if (!["Đang làm việc", "Đã nghỉ"].includes(trangThai)) {
    return "Trạng thái không hợp lệ.";
  }
  return null;
}

// Kiểm tra trùng email / số điện thoại (idBoQua = 0 khi thêm mới)
async function kiemTraTrungNhanVien(email, dienThoai, idBoQua) {
  const [e] = await db.query(
    "SELECT ma_nhan_vien FROM nhan_vien WHERE email = ? AND ma_nhan_vien <> ?",
    [email, idBoQua]
  );
  if (e.length > 0) return "Email này đã được sử dụng cho nhân viên khác.";

  const [s] = await db.query(
    "SELECT ma_nhan_vien FROM nhan_vien WHERE so_dien_thoai = ? AND ma_nhan_vien <> ?",
    [dienThoai, idBoQua]
  );
  if (s.length > 0) return "Số điện thoại này đã tồn tại.";

  return null;
}

app.get("/api/nhan-vien", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${NV_COLUMNS} FROM nhan_vien ORDER BY ma_nhan_vien`
    );
    res.json(rows);
  } catch (error) {
    console.error("Loi lay nhan vien:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách nhân viên." });
  }
});

app.post("/api/nhan-vien", async (req, res) => {
  const loi = kiemTraNhanVien(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { ten, dienThoai, email, chucVu, ngayVaoLam, trangThai } = req.body;

  try {
    const trung = await kiemTraTrungNhanVien(email, dienThoai, 0);
    if (trung) return res.status(409).json({ message: trung });

    await db.query(
      `INSERT INTO nhan_vien (ho_ten, so_dien_thoai, email, chuc_vu, ngay_vao_lam, trang_thai)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ten, dienThoai, email, chucVu, ngayVaoLam, trangThai === "Đang làm việc" ? 1 : 0]
    );
    res.status(201).json({ message: "Đã thêm nhân viên." });
  } catch (error) {
    console.error("Loi them nhan vien:", error.message);
    res.status(500).json({ message: "Không thể thêm nhân viên." });
  }
});

app.put("/api/nhan-vien/:id", async (req, res) => {
  const loi = kiemTraNhanVien(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { ten, dienThoai, email, chucVu, ngayVaoLam, trangThai } = req.body;

  try {
    const trung = await kiemTraTrungNhanVien(email, dienThoai, req.params.id);
    if (trung) return res.status(409).json({ message: trung });

    const [kq] = await db.query(
      `UPDATE nhan_vien
       SET ho_ten = ?, so_dien_thoai = ?, email = ?, chuc_vu = ?, ngay_vao_lam = ?, trang_thai = ?
       WHERE ma_nhan_vien = ?`,
      [ten, dienThoai, email, chucVu, ngayVaoLam, trangThai === "Đang làm việc" ? 1 : 0, req.params.id]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    }
    res.json({ message: "Đã cập nhật nhân viên." });
  } catch (error) {
    console.error("Loi sua nhan vien:", error.message);
    res.status(500).json({ message: "Không thể cập nhật nhân viên." });
  }
});

app.delete("/api/nhan-vien/:id", async (req, res) => {
  try {
    const [kq] = await db.query(
      "DELETE FROM nhan_vien WHERE ma_nhan_vien = ?",
      [req.params.id]
    );
    if (kq.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    }
    res.json({ message: "Đã xóa nhân viên." });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Nhân viên đã gắn với đặt phòng, hóa đơn hoặc tài khoản nên không thể xóa. Hãy chuyển sang 'Đã nghỉ'."
      });
    }
    console.error("Loi xoa nhan vien:", error.message);
    res.status(500).json({ message: "Không thể xóa nhân viên." });
  }
});
/* ================= API ĐẶT PHÒNG ================= */

const MAU_NGAY = /^\d{4}-\d{2}-\d{2}$/;
const GIO_NHAN = "14:00:00";
const GIO_TRA = "12:00:00";

// Phòng còn trống trong khoảng ngày (loại phòng bảo trì và phòng đã có người đặt trùng ngày)
app.get("/api/phong-trong", async (req, res) => {
  const { ngayNhan, ngayTra } = req.query;

  if (!MAU_NGAY.test(ngayNhan || "") || !MAU_NGAY.test(ngayTra || "")) {
    return res.status(400).json({ message: "Ngày nhận hoặc ngày trả không hợp lệ." });
  }
  if (ngayTra <= ngayNhan) {
    return res.status(400).json({ message: "Ngày trả phòng phải sau ngày nhận phòng." });
  }

  try {
    const [rows] = await db.query(
      `SELECT p.so_phong AS number,
              lp.ten_loai_phong AS type,
              p.tang AS floor,
              p.gia_phong AS price,
              lp.so_nguoi_toi_da AS capacity
       FROM phong p
       JOIN loai_phong lp ON lp.ma_loai_phong = p.ma_loai_phong
       WHERE p.trang_thai_van_hanh <> 'BAO_TRI'
         AND NOT EXISTS (
           SELECT 1 FROM chi_tiet_dat_phong ct
           WHERE ct.ma_phong = p.ma_phong
             AND ct.trang_thai IN ('DA_DAT', 'DANG_O')
             AND ct.ngay_nhan_du_kien < ?
             AND ct.ngay_tra_du_kien > ?
         )
       ORDER BY p.so_phong`,
      [`${ngayTra} ${GIO_TRA}`, `${ngayNhan} ${GIO_NHAN}`]
    );
    res.json(rows);
  } catch (error) {
    console.error("Loi lay phong trong:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách phòng trống." });
  }
});

// Tạo đặt phòng (ghi nhiều bảng trong một giao dịch)
app.post("/api/dat-phong", async (req, res) => {
  const { ten, dienThoai, giayTo, email, ngayNhan, ngayTra, soNguoi, phong } = req.body;

  if (!ten || !dienThoai || !giayTo || !phong) {
    return res.status(400).json({ message: "Thiếu thông tin đặt phòng." });
  }
  if (!/^[0-9+\s()-]{9,15}$/.test(dienThoai)) {
    return res.status(400).json({ message: "Số điện thoại chưa đúng định dạng." });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Email chưa đúng định dạng." });
  }
  if (!MAU_NGAY.test(ngayNhan || "") || !MAU_NGAY.test(ngayTra || "") || ngayTra <= ngayNhan) {
    return res.status(400).json({ message: "Ngày trả phòng phải sau ngày nhận phòng." });
  }
  if (!Number.isInteger(Number(soNguoi)) || Number(soNguoi) < 1) {
    return res.status(400).json({ message: "Số người không hợp lệ." });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Khóa dòng phòng để tránh hai người đặt cùng lúc
    const [phongRows] = await conn.query(
      `SELECT p.ma_phong, p.gia_phong, p.trang_thai_van_hanh, lp.so_nguoi_toi_da
       FROM phong p
       JOIN loai_phong lp ON lp.ma_loai_phong = p.ma_loai_phong
       WHERE p.so_phong = ?
       FOR UPDATE`,
      [phong]
    );
    if (phongRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy phòng." });
    }
    const p = phongRows[0];

    if (p.trang_thai_van_hanh === "BAO_TRI") {
      await conn.rollback();
      return res.status(409).json({ message: "Phòng đang bảo trì, không thể đặt." });
    }
    if (Number(soNguoi) > p.so_nguoi_toi_da) {
      await conn.rollback();
      return res.status(400).json({ message: "Số người vượt quá sức chứa của phòng." });
    }

    const nhan = `${ngayNhan} ${GIO_NHAN}`;
    const tra = `${ngayTra} ${GIO_TRA}`;

    const [trung] = await conn.query(
      `SELECT ma_chi_tiet FROM chi_tiet_dat_phong
       WHERE ma_phong = ? AND trang_thai IN ('DA_DAT', 'DANG_O')
         AND ngay_nhan_du_kien < ? AND ngay_tra_du_kien > ?`,
      [p.ma_phong, tra, nhan]
    );
    if (trung.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: "Phòng đã có người đặt trong khoảng ngày này." });
    }

    // Nhân viên mặc định (chưa có đăng nhập)
    const [nv] = await conn.query(
      "SELECT ma_nhan_vien FROM nhan_vien WHERE trang_thai = 1 ORDER BY ma_nhan_vien LIMIT 1"
    );
    if (nv.length === 0) {
      await conn.rollback();
      return res.status(500).json({ message: "Chưa có nhân viên nào để ghi nhận đặt phòng." });
    }

    // Tìm khách theo số giấy tờ, chưa có thì tạo mới
    let maKhach;
    const [kh] = await conn.query(
      "SELECT ma_khach_hang FROM khach_hang WHERE so_giay_to = ?",
      [giayTo]
    );
    if (kh.length > 0) {
      maKhach = kh[0].ma_khach_hang;
      await conn.query(
        "UPDATE khach_hang SET ho_ten = ?, so_dien_thoai = ?, email = COALESCE(?, email) WHERE ma_khach_hang = ?",
        [ten, dienThoai, email || null, maKhach]
      );
    } else {
      const [moi] = await conn.query(
        "INSERT INTO khach_hang (ho_ten, so_giay_to, so_dien_thoai, email) VALUES (?, ?, ?, ?)",
        [ten, giayTo, dienThoai, email || null]
      );
      maKhach = moi.insertId;
    }

    const [dp] = await conn.query(
      "INSERT INTO dat_phong (ma_khach_hang, ma_nhan_vien, trang_thai) VALUES (?, ?, 'DA_XAC_NHAN')",
      [maKhach, nv[0].ma_nhan_vien]
    );

    await conn.query(
      `INSERT INTO chi_tiet_dat_phong
         (ma_dat_phong, ma_phong, ngay_nhan_du_kien, ngay_tra_du_kien, don_gia, trang_thai, so_nguoi)
       VALUES (?, ?, ?, ?, ?, 'DA_DAT', ?)`,
      [dp.insertId, p.ma_phong, nhan, tra, p.gia_phong, Number(soNguoi)]
    );

    await conn.commit();
    res.status(201).json({ message: "Đặt phòng thành công.", maDatPhong: dp.insertId });
  } catch (error) {
    await conn.rollback();
    console.error("Loi dat phong:", error.message);
    res.status(500).json({ message: "Không thể lưu đặt phòng." });
  } finally {
    conn.release();
  }
});
/* ================= API NHẬN / TRẢ PHÒNG ================= */

// Danh sách lưu trú (mỗi dòng là một phòng trong một đặt phòng)
app.get("/api/luu-tru", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ct.ma_chi_tiet AS id,
             kh.ho_ten AS name,
             kh.so_dien_thoai AS phone,
             p.so_phong AS room,
             DATE_FORMAT(IFNULL(ct.ngay_nhan_thuc_te, ct.ngay_nhan_du_kien), '%Y-%m-%d') AS checkin,
             DATE_FORMAT(IFNULL(ct.ngay_tra_thuc_te, ct.ngay_tra_du_kien), '%Y-%m-%d') AS checkout,
             CASE
               WHEN ct.trang_thai = 'DA_DAT' THEN 'waiting'
               WHEN ct.trang_thai = 'DANG_O' AND DATE(ct.ngay_tra_du_kien) <= CURDATE() THEN 'checkout'
               WHEN ct.trang_thai = 'DANG_O' THEN 'staying'
               WHEN ct.trang_thai = 'DA_TRA' THEN 'completed'
               ELSE 'other'
             END AS status
      FROM chi_tiet_dat_phong ct
      JOIN dat_phong dp ON dp.ma_dat_phong = ct.ma_dat_phong
      JOIN khach_hang kh ON kh.ma_khach_hang = dp.ma_khach_hang
      JOIN phong p ON p.ma_phong = ct.ma_phong
      WHERE ct.trang_thai IN ('DA_DAT', 'DANG_O', 'DA_TRA')
      ORDER BY ct.ma_chi_tiet DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Loi lay luu tru:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách lưu trú." });
  }
});

// Nhận phòng
app.post("/api/luu-tru/:id/nhan-phong", async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT ma_phong, trang_thai FROM chi_tiet_dat_phong WHERE ma_chi_tiet = ? FOR UPDATE",
      [req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy lượt đặt phòng." });
    }
    if (rows[0].trang_thai !== "DA_DAT") {
      await conn.rollback();
      return res.status(409).json({ message: "Khách này không ở trạng thái chờ nhận phòng." });
    }

    const [dangO] = await conn.query(
      "SELECT ma_chi_tiet FROM chi_tiet_dat_phong WHERE ma_phong = ? AND trang_thai = 'DANG_O'",
      [rows[0].ma_phong]
    );
    if (dangO.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: "Phòng này đang có khách khác lưu trú." });
    }

    await conn.query(
      "UPDATE chi_tiet_dat_phong SET trang_thai = 'DANG_O', ngay_nhan_thuc_te = NOW() WHERE ma_chi_tiet = ?",
      [req.params.id]
    );
    await conn.query(
      "UPDATE phong SET trang_thai_van_hanh = 'DANG_SU_DUNG' WHERE ma_phong = ?",
      [rows[0].ma_phong]
    );

    await conn.commit();
    res.json({ message: "Đã xác nhận nhận phòng." });
  } catch (error) {
    await conn.rollback();
    console.error("Loi nhan phong:", error.message);
    res.status(500).json({ message: "Không thể nhận phòng." });
  } finally {
    conn.release();
  }
});

// Trả phòng (tự tạo hóa đơn nháp khi trả hết phòng của đặt phòng)
app.post("/api/luu-tru/:id/tra-phong", async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT ma_phong, ma_dat_phong, trang_thai FROM chi_tiet_dat_phong WHERE ma_chi_tiet = ? FOR UPDATE",
      [req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy lượt đặt phòng." });
    }
    if (rows[0].trang_thai !== "DANG_O") {
      await conn.rollback();
      return res.status(409).json({ message: "Khách này không thể thực hiện trả phòng." });
    }

    await conn.query(
      "UPDATE chi_tiet_dat_phong SET trang_thai = 'DA_TRA', ngay_tra_thuc_te = NOW() WHERE ma_chi_tiet = ?",
      [req.params.id]
    );
    await conn.query(
      "UPDATE phong SET trang_thai_van_hanh = 'SAN_SANG' WHERE ma_phong = ?",
      [rows[0].ma_phong]
    );

    let thongBao = "Đã xác nhận trả phòng.";

    const [conLai] = await conn.query(
      "SELECT COUNT(*) AS soLuong FROM chi_tiet_dat_phong WHERE ma_dat_phong = ? AND trang_thai <> 'DA_TRA'",
      [rows[0].ma_dat_phong]
    );

    if (conLai[0].soLuong === 0) {
      await conn.query(
        "UPDATE dat_phong SET trang_thai = 'HOAN_THANH' WHERE ma_dat_phong = ?",
        [rows[0].ma_dat_phong]
      );

      // Tự tạo hóa đơn nháp nếu đặt phòng chưa có hóa đơn
      const [daCo] = await conn.query(
        "SELECT ma_hoa_don FROM hoa_don WHERE ma_dat_phong = ?",
        [rows[0].ma_dat_phong]
      );

      if (daCo.length === 0) {
        const maNv = await layNhanVienMacDinh(conn);

        if (maNv) {
          const tien = await tinhTien(conn, rows[0].ma_dat_phong);

          await conn.query(
            `INSERT INTO hoa_don
               (ma_dat_phong, ma_nhan_vien, tien_phong, tien_dich_vu, giam_gia, tong_tien, trang_thai)
             VALUES (?, ?, ?, ?, 0, ?, 'NHAP')`,
            [rows[0].ma_dat_phong, maNv, tien.tienPhong, tien.tienDichVu, tien.tong]
          );
          thongBao = "Đã trả phòng và tạo hóa đơn nháp.";
        }
      }
    }

    await conn.commit();
    res.json({ message: thongBao });
  } catch (error) {
    await conn.rollback();
    console.error("Loi tra phong:", error.message);
    res.status(500).json({ message: "Không thể trả phòng." });
  } finally {
    conn.release();
  }
});
/* ================= API HÓA ĐƠN ================= */

const PHUONG_THUC_HOP_LE = ["Tiền mặt", "Chuyển khoản", "Thẻ ngân hàng"];

// Tính tiền phòng và tiền dịch vụ của một đặt phòng
async function tinhTien(conn, maDatPhong) {
  const [p] = await conn.query(
    `SELECT IFNULL(SUM(ct.don_gia * GREATEST(1, DATEDIFF(
              DATE(IFNULL(ct.ngay_tra_thuc_te, ct.ngay_tra_du_kien)),
              DATE(IFNULL(ct.ngay_nhan_thuc_te, ct.ngay_nhan_du_kien)))
            )), 0) AS tienPhong
     FROM chi_tiet_dat_phong ct
     WHERE ct.ma_dat_phong = ?`,
    [maDatPhong]
  );
  const [d] = await conn.query(
    `SELECT IFNULL(SUM(sd.so_luong * sd.don_gia), 0) AS tienDichVu
     FROM su_dung_dich_vu sd
     JOIN chi_tiet_dat_phong ct ON ct.ma_chi_tiet = sd.ma_chi_tiet_dat_phong
     WHERE ct.ma_dat_phong = ?`,
    [maDatPhong]
  );
  const tienPhong = Number(p[0].tienPhong);
  const tienDichVu = Number(d[0].tienDichVu);
  return { tienPhong, tienDichVu, tong: tienPhong + tienDichVu };
}

function kiemTraHoaDon(body) {
  const { ngayLap, phuongThuc, trangThai } = body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngayLap || "")) return "Ngày lập không hợp lệ.";
  if (!["Đã thanh toán", "Chưa thanh toán"].includes(trangThai)) {
    return "Trạng thái không hợp lệ.";
  }
  if (trangThai === "Đã thanh toán" && !PHUONG_THUC_HOP_LE.includes(phuongThuc)) {
    return "Vui lòng chọn phương thức thanh toán.";
  }
  return null;
}

async function layNhanVienMacDinh(conn) {
  const [nv] = await conn.query(
    "SELECT ma_nhan_vien FROM nhan_vien WHERE trang_thai = 1 ORDER BY ma_nhan_vien LIMIT 1"
  );
  return nv.length > 0 ? nv[0].ma_nhan_vien : null;
}

const HD_SELECT = `
  SELECT hd.ma_hoa_don AS id,
         CONCAT('HD', LPAD(hd.ma_hoa_don, 3, '0')) AS ma,
         hd.ma_dat_phong AS maDatPhong,
         kh.ho_ten AS khachHang,
         IFNULL((SELECT GROUP_CONCAT(p.so_phong ORDER BY p.so_phong SEPARATOR ', ')
                 FROM chi_tiet_dat_phong ct
                 JOIN phong p ON p.ma_phong = ct.ma_phong
                 WHERE ct.ma_dat_phong = hd.ma_dat_phong), '') AS phong,
         DATE_FORMAT(hd.ngay_lap, '%Y-%m-%d') AS ngayLap,
         hd.tien_phong AS tienPhong,
         hd.tien_dich_vu AS tienDichVu,
         hd.tong_tien AS tongTien,
         IFNULL((SELECT tt.phuong_thuc FROM thanh_toan tt
                 WHERE tt.ma_hoa_don = hd.ma_hoa_don
                 ORDER BY tt.ma_thanh_toan DESC LIMIT 1), '') AS phuongThuc,
         IF(hd.trang_thai = 'DA_THANH_TOAN', 'Đã thanh toán', 'Chưa thanh toán') AS trangThai
  FROM hoa_don hd
  JOIN dat_phong dp ON dp.ma_dat_phong = hd.ma_dat_phong
  JOIN khach_hang kh ON kh.ma_khach_hang = dp.ma_khach_hang
`;

// Danh sách hóa đơn
app.get("/api/hoa-don", async (req, res) => {
  try {
    const [rows] = await db.query(`${HD_SELECT} ORDER BY hd.ma_hoa_don DESC`);
    res.json(rows);
  } catch (error) {
    console.error("Loi lay hoa don:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách hóa đơn." });
  }
});

// Các đặt phòng chưa có hóa đơn (để chọn khi tạo hóa đơn)
app.get("/api/dat-phong-cho-hoa-don", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT dp.ma_dat_phong AS maDatPhong,
             kh.ho_ten AS khachHang,
             IFNULL((SELECT GROUP_CONCAT(p.so_phong ORDER BY p.so_phong SEPARATOR ', ')
                     FROM chi_tiet_dat_phong ct
                     JOIN phong p ON p.ma_phong = ct.ma_phong
                     WHERE ct.ma_dat_phong = dp.ma_dat_phong), '') AS phong
      FROM dat_phong dp
      JOIN khach_hang kh ON kh.ma_khach_hang = dp.ma_khach_hang
      WHERE NOT EXISTS (SELECT 1 FROM hoa_don hd WHERE hd.ma_dat_phong = dp.ma_dat_phong)
      ORDER BY dp.ma_dat_phong DESC
    `);

    for (const row of rows) {
      const tien = await tinhTien(db, row.maDatPhong);
      row.tongTien = tien.tong;
    }
    res.json(rows);
  } catch (error) {
    console.error("Loi lay dat phong:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách đặt phòng." });
  }
});

// Tạo hóa đơn
app.post("/api/hoa-don", async (req, res) => {
  const loi = kiemTraHoaDon(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { maDatPhong, ngayLap, phuongThuc, trangThai } = req.body;
  const daThanhToan = trangThai === "Đã thanh toán";

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [dp] = await conn.query(
      "SELECT ma_dat_phong FROM dat_phong WHERE ma_dat_phong = ?",
      [maDatPhong]
    );
    if (dp.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy đặt phòng." });
    }

    const maNv = await layNhanVienMacDinh(conn);
    if (!maNv) {
      await conn.rollback();
      return res.status(500).json({ message: "Chưa có nhân viên nào để lập hóa đơn." });
    }

    const tien = await tinhTien(conn, maDatPhong);
    if (tien.tienPhong <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Đặt phòng này chưa có tiền phòng để lập hóa đơn." });
    }

    const [kq] = await conn.query(
      `INSERT INTO hoa_don
         (ma_dat_phong, ma_nhan_vien, ngay_lap, tien_phong, tien_dich_vu, giam_gia, tong_tien, trang_thai)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [maDatPhong, maNv, `${ngayLap} 00:00:00`, tien.tienPhong, tien.tienDichVu, tien.tong,
       daThanhToan ? "DA_THANH_TOAN" : "NHAP"]
    );

    if (daThanhToan) {
      await conn.query(
        `INSERT INTO thanh_toan (ma_hoa_don, ma_nhan_vien, so_tien, phuong_thuc, trang_thai)
         VALUES (?, ?, ?, ?, 'THANH_CONG')`,
        [kq.insertId, maNv, tien.tong, phuongThuc]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Đã tạo hóa đơn." });
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Đặt phòng này đã có hóa đơn." });
    }
    console.error("Loi tao hoa don:", error.message);
    res.status(500).json({ message: "Không thể tạo hóa đơn." });
  } finally {
    conn.release();
  }
});

// Sửa hóa đơn (ngày lập, trạng thái, phương thức)
app.put("/api/hoa-don/:id", async (req, res) => {
  const loi = kiemTraHoaDon(req.body);
  if (loi) return res.status(400).json({ message: loi });

  const { ngayLap, phuongThuc, trangThai } = req.body;
  const moiDaThanhToan = trangThai === "Đã thanh toán";

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT ma_dat_phong, trang_thai FROM hoa_don WHERE ma_hoa_don = ? FOR UPDATE",
      [req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy hóa đơn." });
    }

    const cuDaThanhToan = rows[0].trang_thai === "DA_THANH_TOAN";
    const maNv = await layNhanVienMacDinh(conn);

    // Hóa đơn đã thanh toán giữ nguyên số tiền; chưa thanh toán thì tính lại
    if (!(cuDaThanhToan && moiDaThanhToan)) {
      const tien = await tinhTien(conn, rows[0].ma_dat_phong);
      await conn.query(
        `UPDATE hoa_don
         SET tien_phong = ?, tien_dich_vu = ?, tong_tien = ?
         WHERE ma_hoa_don = ?`,
        [tien.tienPhong, tien.tienDichVu, tien.tong, req.params.id]
      );
    }

    await conn.query(
      "UPDATE hoa_don SET ngay_lap = ?, trang_thai = ? WHERE ma_hoa_don = ?",
      [`${ngayLap} 00:00:00`, moiDaThanhToan ? "DA_THANH_TOAN" : "NHAP", req.params.id]
    );

    if (moiDaThanhToan && cuDaThanhToan) {
      await conn.query(
        "UPDATE thanh_toan SET phuong_thuc = ? WHERE ma_hoa_don = ?",
        [phuongThuc, req.params.id]
      );
    } else if (moiDaThanhToan && !cuDaThanhToan) {
      const [tong] = await conn.query(
        "SELECT tong_tien FROM hoa_don WHERE ma_hoa_don = ?",
        [req.params.id]
      );
      await conn.query(
        `INSERT INTO thanh_toan (ma_hoa_don, ma_nhan_vien, so_tien, phuong_thuc, trang_thai)
         VALUES (?, ?, ?, ?, 'THANH_CONG')`,
        [req.params.id, maNv, tong[0].tong_tien, phuongThuc]
      );
    } else if (!moiDaThanhToan && cuDaThanhToan) {
      await conn.query("DELETE FROM thanh_toan WHERE ma_hoa_don = ?", [req.params.id]);
    }

    await conn.commit();
    res.json({ message: "Đã cập nhật hóa đơn." });
  } catch (error) {
    await conn.rollback();
    console.error("Loi sua hoa don:", error.message);
    res.status(500).json({ message: "Không thể cập nhật hóa đơn." });
  } finally {
    conn.release();
  }
});

// Xóa hóa đơn
app.delete("/api/hoa-don/:id", async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM thanh_toan WHERE ma_hoa_don = ?", [req.params.id]);
    const [kq] = await conn.query("DELETE FROM hoa_don WHERE ma_hoa_don = ?", [req.params.id]);

    if (kq.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy hóa đơn." });
    }

    await conn.commit();
    res.json({ message: "Đã xóa hóa đơn." });
  } catch (error) {
    await conn.rollback();
    console.error("Loi xoa hoa don:", error.message);
    res.status(500).json({ message: "Không thể xóa hóa đơn." });
  } finally {
    conn.release();
  }
});
/* ================= API TỔNG QUAN ================= */

app.get("/api/tong-quan", xacThucToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS tongPhong,
             IFNULL(SUM(trang_thai_van_hanh = 'SAN_SANG'), 0) AS phongTrong,
             IFNULL(SUM(trang_thai_van_hanh = 'DANG_SU_DUNG'), 0) AS dangSuDung,
             IFNULL(SUM(trang_thai_van_hanh = 'DA_DAT'), 0) AS daDat,
             IFNULL(SUM(trang_thai_van_hanh = 'BAO_TRI'), 0) AS baoTri
      FROM phong
    `);

    const r = rows[0];
    res.json({
      tongPhong: Number(r.tongPhong),
      phongTrong: Number(r.phongTrong),
      dangSuDung: Number(r.dangSuDung),
      daDat: Number(r.daDat),
      baoTri: Number(r.baoTri)
    });
  } catch (error) {
    console.error("Loi tong quan:", error.message);
    res.status(500).json({ message: "Không thể lấy số liệu tổng quan." });
  }
});
/* ================= API SỬ DỤNG DỊCH VỤ ================= */

// Danh sách dịch vụ khách đã dùng trong một lượt lưu trú
app.get("/api/luu-tru/:id/dich-vu", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT sd.ma_su_dung AS id,
              dv.ten_dich_vu AS ten,
              dv.don_vi_tinh AS donVi,
              sd.so_luong AS soLuong,
              sd.don_gia AS donGia,
              DATE_FORMAT(sd.thoi_diem, '%d/%m/%Y %H:%i') AS thoiDiem
       FROM su_dung_dich_vu sd
       JOIN dich_vu dv ON dv.ma_dich_vu = sd.ma_dich_vu
       WHERE sd.ma_chi_tiet_dat_phong = ?
       ORDER BY sd.ma_su_dung DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Loi lay dich vu da dung:", error.message);
    res.status(500).json({ message: "Không thể lấy danh sách dịch vụ đã dùng." });
  }
});

// Thêm dịch vụ cho khách đang ở
app.post("/api/luu-tru/:id/dich-vu", async (req, res) => {
  const maDichVu = Number(req.body.maDichVu);
  const soLuong = Number(req.body.soLuong);

  if (!Number.isInteger(maDichVu) || maDichVu < 1) {
    return res.status(400).json({ message: "Vui lòng chọn dịch vụ." });
  }
  if (!Number.isFinite(soLuong) || soLuong <= 0 || soLuong > 1000) {
    return res.status(400).json({ message: "Số lượng phải lớn hơn 0 và không quá 1000." });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [ct] = await conn.query(
      "SELECT trang_thai FROM chi_tiet_dat_phong WHERE ma_chi_tiet = ? FOR UPDATE",
      [req.params.id]
    );
    if (ct.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy lượt lưu trú." });
    }
    if (ct[0].trang_thai !== "DANG_O") {
      await conn.rollback();
      return res.status(409).json({ message: "Chỉ ghi dịch vụ cho khách đang lưu trú." });
    }

    const [dv] = await conn.query(
      "SELECT don_gia, trang_thai FROM dich_vu WHERE ma_dich_vu = ?",
      [maDichVu]
    );
    if (dv.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Không tìm thấy dịch vụ." });
    }
    if (dv[0].trang_thai !== 1) {
      await conn.rollback();
      return res.status(409).json({ message: "Dịch vụ này đang ngừng hoạt động." });
    }

    const maNv = await layNhanVienMacDinh(conn);
    if (!maNv) {
      await conn.rollback();
      return res.status(500).json({ message: "Chưa có nhân viên nào để ghi nhận dịch vụ." });
    }

    await conn.query(
      `INSERT INTO su_dung_dich_vu
         (ma_chi_tiet_dat_phong, ma_dich_vu, ma_nhan_vien, so_luong, don_gia)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, maDichVu, maNv, soLuong, dv[0].don_gia]
    );

    await conn.commit();
    res.status(201).json({ message: "Đã thêm dịch vụ." });
  } catch (error) {
    await conn.rollback();
    console.error("Loi them su dung dich vu:", error.message);
    res.status(500).json({ message: "Không thể thêm dịch vụ." });
  } finally {
    conn.release();
  }
});

// Xóa một dòng dịch vụ (chỉ khi khách còn đang ở)
app.delete("/api/su-dung-dich-vu/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ct.trang_thai
       FROM su_dung_dich_vu sd
       JOIN chi_tiet_dat_phong ct ON ct.ma_chi_tiet = sd.ma_chi_tiet_dat_phong
       WHERE sd.ma_su_dung = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dòng dịch vụ." });
    }
    if (rows[0].trang_thai !== "DANG_O") {
      return res.status(409).json({ message: "Khách đã trả phòng nên không thể xóa dịch vụ." });
    }

    await db.query("DELETE FROM su_dung_dich_vu WHERE ma_su_dung = ?", [req.params.id]);
    res.json({ message: "Đã xóa dịch vụ." });
  } catch (error) {
    console.error("Loi xoa su dung dich vu:", error.message);
    res.status(500).json({ message: "Không thể xóa dịch vụ." });
  }
});

// ===============================
// API ĐĂNG NHẬP STAYFLOW
// ===============================

app.post("/api/login", async (req, res) => {
  try {
    const { ten_dang_nhap, mat_khau } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!ten_dang_nhap || !mat_khau) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên đăng nhập và mật khẩu."
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("Chưa cấu hình JWT_SECRET trong .env");
      return res.status(500).json({
        success: false,
        message: "Máy chủ chưa được cấu hình bảo mật."
      });
    }

    // Tìm tài khoản và thông tin nhân viên
    const [rows] = await db.query(
      `SELECT
          tk.ma_tai_khoan,
          tk.ma_vai_tro,
          tk.ma_nhan_vien,
          tk.ten_dang_nhap,
          tk.mat_khau_hash,
          tk.trang_thai,
          nv.ho_ten,
          nv.email,
          vt.ten_vai_tro
       FROM tai_khoan tk
       JOIN nhan_vien nv
          ON tk.ma_nhan_vien = nv.ma_nhan_vien
       JOIN vai_tro vt
          ON tk.ma_vai_tro = vt.ma_vai_tro
       WHERE tk.ten_dang_nhap = ?
       LIMIT 1`,
      [ten_dang_nhap.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Tên đăng nhập hoặc mật khẩu không chính xác."
      });
    }

    const user = rows[0];

    // Kiểm tra trạng thái tài khoản
    if (user.trang_thai !== 1) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa hoặc ngừng hoạt động."
      });
    }

    // Kiểm tra mật khẩu
    const passwordMatch = await bcrypt.compare(
      mat_khau,
      user.mat_khau_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Tên đăng nhập hoặc mật khẩu không chính xác."
      });
    }

    // Tạo JWT
    const token = jwt.sign(
      {
        ma_tai_khoan: user.ma_tai_khoan,
        ma_nhan_vien: user.ma_nhan_vien,
        ma_vai_tro: user.ma_vai_tro,
        ten_vai_tro: user.ten_vai_tro
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Trả kết quả đăng nhập
    return res.json({
      success: true,
      message: "Đăng nhập thành công!",
      token: token,
      user: {
        ma_tai_khoan: user.ma_tai_khoan,
        ma_nhan_vien: user.ma_nhan_vien,
        ten_dang_nhap: user.ten_dang_nhap,
        ho_ten: user.ho_ten,
        email: user.email,
        ma_vai_tro: user.ma_vai_tro,
        ten_vai_tro: user.ten_vai_tro
      }
    });

  } catch (error) {
    console.error("Lỗi đăng nhập:", error.message);

    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi đăng nhập."
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Server dang chay tai http://localhost:${PORT}`);

  try {
    const connection = await db.getConnection();

    console.log("MySQL ket noi thanh cong!");

    connection.release();
  } catch (error) {
    console.error("MySQL ket noi that bai:", error.message);
  }
});