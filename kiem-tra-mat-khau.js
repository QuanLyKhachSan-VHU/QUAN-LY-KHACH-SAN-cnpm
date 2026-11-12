const bcrypt = require("bcryptjs");
const db = require("./db");

async function main() {
    const [rows] = await db.query(
        "SELECT ten_dang_nhap, mat_khau_hash FROM tai_khoan WHERE ten_dang_nhap = ?",
        ["admin"]
    );

    if (rows.length === 0) {
        console.log("Không tìm thấy tài khoản admin");
        return;
    }

    const result = await bcrypt.compare(
        "Admin@12345",
        rows[0].mat_khau_hash
    );

    console.log("Kết quả kiểm tra:", result);

    process.exit();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});