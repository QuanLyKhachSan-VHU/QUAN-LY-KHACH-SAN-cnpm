
const db = require("./db");
const bcrypt = require("bcryptjs");

async function taoTaiKhoan() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Kiểm tra nhân viên
    const [nhanVien] = await conn.query(
      "SELECT ma_nhan_vien FROM nhan_vien WHERE ma_nhan_vien IN (1, 2)"
    );

    if (nhanVien.length !== 2) {
      throw new Error("Không tìm thấy đủ 2 nhân viên.");
    }

    // Lấy mã vai trò theo tên
    const [vaiTro] = await conn.query(
      "SELECT ma_vai_tro, ten_vai_tro FROM vai_tro"
    );

    const adminRole = vaiTro.find(
      v => v.ten_vai_tro === "Quản trị viên"
    );

    const receptionistRole = vaiTro.find(
      v => v.ten_vai_tro === "Lễ tân"
    );

    if (!adminRole || !receptionistRole) {
      throw new Error("Không tìm thấy vai trò.");
    }

    // Kiểm tra tài khoản trùng
    const [existing] = await conn.query(
      `SELECT * FROM tai_khoan
       WHERE ten_dang_nhap IN (?, ?)
       OR ma_nhan_vien IN (?, ?)`,
      ["admin", "kiet", 1, 2]
    );

    if (existing.length > 0) {
      throw new Error("Tài khoản đã tồn tại. Không thêm trùng.");
    }

    // Mật khẩu mẫu - có thể thay đổi
    const passwordAdmin = "Admin@12345";
    const passwordKiet = "Kiet@12345";

    // Mã hóa mật khẩu
    const hashAdmin = await bcrypt.hash(passwordAdmin, 10);
    const hashKiet = await bcrypt.hash(passwordKiet, 10);

    // Tạo tài khoản quản trị viên
    await conn.query(
      `INSERT INTO tai_khoan
       (ma_vai_tro, ma_nhan_vien, ten_dang_nhap,
        mat_khau_hash, trang_thai)
       VALUES (?, ?, ?, ?, 1)`,
      [adminRole.ma_vai_tro, 1, "admin", hashAdmin]
    );

    // Tạo tài khoản lễ tân
    await conn.query(
      `INSERT INTO tai_khoan
       (ma_vai_tro, ma_nhan_vien, ten_dang_nhap,
        mat_khau_hash, trang_thai)
       VALUES (?, ?, ?, ?, 1)`,
      [receptionistRole.ma_vai_tro, 2, "kiet", hashKiet]
    );

    await conn.commit();

    console.log("Da tao 2 tai khoan thanh cong!");
    console.log("Admin: admin");
    console.log("Le tan: kiet");

  } catch (error) {
    await conn.rollback();
    console.error("Loi:", error.message);
  } finally {
    conn.release();
    await db.end();
  }
}

taoTaiKhoan();
