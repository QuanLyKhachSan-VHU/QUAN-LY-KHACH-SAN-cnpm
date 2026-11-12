const bcrypt = require("bcryptjs");

async function main() {
    const hashAdmin = await bcrypt.hash("Admin@12345", 10);
    const hashKiet = await bcrypt.hash("Kiet@12345", 10);

    console.log("ADMIN_HASH=" + hashAdmin);
    console.log("KIET_HASH=" + hashKiet);
}

main();