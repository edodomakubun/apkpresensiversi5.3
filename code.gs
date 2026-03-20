// --- KONFIGURASI SPREADSHEET ---
const ID_SS_LOGIN = "1GufNbOjalVMx1WatVkIcZTSgwc7YZVWo6vjJZXAM6ZE"; 
const NAMA_SHEET_USER = "Data Guru";

const ID_SS_ABSEN = "1glP7Tp5uYRgfKn4ZDJgpIlkYxOrIbWk2gzGxUSELlSw"; 
const NAMA_SHEET_ABSEN = "Log_Absen";
const NAMA_SHEET_APPROVAL = "Approval"; 
const NAMA_SHEET_LIBUR = "Libur"; // --- TAMBAHAN: Nama sheet untuk hari libur ---
const NAMA_SHEET_NOTIFIKASI = "PEMBERITAHUAN";

const TIMEZONE = "Asia/Jayapura";

// --- KONSTANTA ---
const CONSTANTS = { 
  STATUS: { 
    MASUK: "Absensi Masuk", 
    PULANG: "Absensi Pulang", 
    TERLAMBAT: "Terlambat" 
  } 
};

// --- JADWAL (Sesuaikan jika testing selesai) ---
const JADWAL = { 
  MASUK_MULAI: 6*60 + 30,  // 06:30
  MASUK_AKHIR: 8*60,       // 08:00
  PULANG_MULAI: 11*60,     // 11:00
  PULANG_AKHIR: 14*60 + 40 // 14:40
};

// --- LOKASI SEKOLAH ---
const LOKASI_SEKOLAH = {
  LAT: -7.14872,
  LNG: 131.70819, 
  RADIUS_METER: 20 // Batas 20 Meter
};

// ==========================================
// FUNGSI UTAMA (ROUTER)
// ==========================================

function doPost(e) {
  try {
    var request = (e.postData) ? JSON.parse(e.postData.contents) : e.parameter;
    
    // 1. FITUR UMUM
    if (request.action == "login") return handleLogin(request);
    else if (request.action == "absen") return handleAbsensi(request);
    else if (request.action == "izin") return handleIzin(request);
    
    // 2. FITUR ADMIN (APPROVAL)
    else if (request.action == "get_pending") return getPendingApprovals();
    else if (request.action == "approve_reject") return handleAdminAction(request);
    
    // 3. FITUR ADMIN (MONITORING & FORCE FINISH)
    else if (request.action == "get_active_leaves") return getActiveLeaves();
    else if (request.action == "force_finish") return forceFinishLeave(request);
    
    // 4. NOTIFIKASI
    else if (request.action == "get_notification") return getNotification();

    else return createJsonResponse({ status: "error", message: "Action tidak dikenal!" });
  } catch (error) {
    return createJsonResponse({ status: "error", message: "SERVER ERROR: " + error.toString() });
  }
}

function doGet(e) {
  // Pengamanan ekstra jika e atau e.parameter tidak ada
  if (!e || !e.parameter || !e.parameter.nama) {
    return createJsonResponse({ status: "error", message: "Parameter nama tidak ditemukan" });
  }
  
  try {
    const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
    
    // 1. Data Absen
    const sheetAbsen = ss.getSheetByName(NAMA_SHEET_ABSEN);
    const dataAbsen = sheetAbsen ? sheetAbsen.getDataRange().getValues() : [];
    
    // 2. Data Approval
    const sheetApproval = ss.getSheetByName(NAMA_SHEET_APPROVAL);
    const dataApproval = sheetApproval ? sheetApproval.getDataRange().getValues() : [];

    // 3. Tarik Riwayat
    const history = getHistoryForTeacher(e.parameter.nama, dataAbsen, dataApproval);
    return createJsonResponse(history);
    
  } catch (error) {
    return createJsonResponse([{ 
      isoTimestamp: new Date().toISOString(), 
      nama: e.parameter.nama, 
      keterangan: "SISTEM ERROR: " + error.message 
    }]);
  }
}

// ==========================================
// LOGIKA ABSENSI & LOGIN
// ==========================================

function handleLogin(data) {
  const inputIdUser = String(data.nama).trim(); 
  const inputPin = String(data.pin).trim();
  const inputDeviceId = data.deviceId;

  const ss = SpreadsheetApp.openById(ID_SS_LOGIN);
  const sheet = ss.getSheetByName(NAMA_SHEET_USER);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0]; 
  const idxId = headers.indexOf("Id"), idxPin = headers.indexOf("PIN"), idxNama = headers.indexOf("Nama"), idxDevice = headers.indexOf("DeviceId");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[idxId]).toLowerCase() === inputIdUser.toLowerCase() && String(row[idxPin]) === inputPin) {
       let userProfile = {};
       headers.forEach((h, index) => { if(index !== idxPin && index !== idxDevice) userProfile[h] = row[index]; });
       const dbDeviceId = row[idxDevice];
       if (!dbDeviceId || dbDeviceId == "" || dbDeviceId == inputDeviceId) {
         if (!dbDeviceId) sheet.getRange(i + 1, idxDevice + 1).setValue(inputDeviceId);
         return createJsonResponse({ status: "success", message: "Login Berhasil", data: { nama: row[idxNama], profile: userProfile } });
       } else return createJsonResponse({ status: "error", message: "Akun terkunci di HP lain." });
    }
  }
  return createJsonResponse({ status: "error", message: "ID atau PIN Salah!" });
}

function handleAbsensi(params) {
  const namaGuru = params.namaGuru;
  const lat = Number(params.latitude);
  const lng = Number(params.longitude);

  // --- TAMBAHAN KODE: PENGECEKAN HARI LIBUR ---
  const statusLibur = cekHariLibur();
  if (statusLibur.isLibur) {
     return createJsonResponse({ 
       status: "error", 
       message: `ABSEN DITUTUP: Hari ini adalah ${statusLibur.namaLibur} (Sampai tanggal ${statusLibur.tglSelesaiStr}).` 
     });
  }
  // --------------------------------------------

  if (!lat || !lng) return createJsonResponse({ status: "error", message: "GPS Error." });

  // 1. Hitung Jarak
  const jarak = hitungJarak(lat, lng, LOKASI_SEKOLAH.LAT, LOKASI_SEKOLAH.LNG);
  
  // 2. Logika Pengecekan Jarak
  if (jarak > LOKASI_SEKOLAH.RADIUS_METER) {
     return createJsonResponse({ 
       status: "error", 
       message: `GAGAL: Jarak Terlalu Jauh!\nAnda berjarak ${Math.ceil(jarak)} meter dari sekolah.\n(Maksimal ${LOKASI_SEKOLAH.RADIUS_METER} meter)` 
     });
  }

  const sheet = SpreadsheetApp.openById(ID_SS_ABSEN).getSheetByName(NAMA_SHEET_ABSEN);
  const now = new Date();
  const todayWIT = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd");
  
  const allData = sheet.getDataRange().getValues();
  
  // PERBAIKAN: Gunakan helper untuk mengatasi object Date agar tidak salah baca
  const todaysRecords = allData.filter(r => r[2] === namaGuru && getFormattedDateString(r[0], "yyyy-MM-dd") === todayWIT);
  
  const check = checkTodaysAttendance(todaysRecords);
  const statusAbsen = determineAttendanceStatus(now, check.hasIn, check.hasOut);

  if (statusAbsen.includes("INVALID") || statusAbsen.includes("ALREADY") || statusAbsen.includes("MUST")) {
     let msg = "Belum waktunya.";
     if (statusAbsen.includes("ALREADY")) {
         msg = "Sudah absen!";
     } else if (statusAbsen.includes("INVALID")) {
         msg = "Jadwal Tutup/Belum Buka";
     } else if (statusAbsen.includes("MUST")) {
         msg = "Anda harus absen masuk dulu"; // Pesan baru ditambahkan di sini
     }
     return createJsonResponse({ status: "error", message: msg });
  }

  const timestampWIT = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy H:mm:ss");
  const isoTimestamp = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  sheet.appendRow([isoTimestamp, timestampWIT, namaGuru, statusAbsen, lat, lng, "-", "-"]);
  return createJsonResponse({ status: "success", message: `${statusAbsen} Berhasil! Jarak: ${Math.ceil(jarak)}m` });
}

function handleIzin(params) {
  const namaGuru = params.namaGuru;
  const tipe = params.tipe;    
  const alasan = params.alasan; 

  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  let sheet = ss.getSheetByName(NAMA_SHEET_APPROVAL);
  if (!sheet) { 
      sheet = ss.insertSheet(NAMA_SHEET_APPROVAL); 
      sheet.appendRow(["ISO", "Waktu", "Nama", "Tipe", "Alasan", "Status", "Tgl Mulai", "Tgl Selesai", "Status Selesai"]); 
  }

  const now = new Date();
  const todayWIT = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd");
  
  const allData = sheet.getDataRange().getValues();
  // PERBAIKAN: Gunakan helper format Date agar aman
  const alreadyExist = allData.some(row => row[2] === namaGuru && getFormattedDateString(row[0], "yyyy-MM-dd") === todayWIT);
  if (alreadyExist) return createJsonResponse({ status: "error", message: "Pengajuan hari ini sudah ada!" });

  const timestampWIT = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy H:mm:ss");
  const isoTimestamp = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  
  // Append row dengan kolom kosong di akhir (termasuk kolom Status Selesai)
  sheet.appendRow([isoTimestamp, timestampWIT, namaGuru, tipe, alasan, "MENUNGGU", "", "", ""]);
  
  return createJsonResponse({ status: "success", message: "Terkirim. Menunggu persetujuan." });
}

// ==========================================
// FITUR ADMIN: APPROVAL & MONITORING
// ==========================================

// 1. Ambil Data Pending (Status: MENUNGGU)
function getPendingApprovals() {
  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  const sheet = ss.getSheetByName(NAMA_SHEET_APPROVAL);
  if (!sheet) return createJsonResponse({ status: "empty", data: [] });

  const data = sheet.getDataRange().getValues();
  let pendingList = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[5]) === "MENUNGGU") {
      pendingList.push({
        iso: row[0],
        waktu: row[1],
        nama: row[2],
        tipe: row[3],
        alasan: row[4]
      });
    }
  }
  return createJsonResponse({ status: "success", data: pendingList });
}

// 2. Eksekusi Persetujuan/Penolakan oleh Admin
function handleAdminAction(params) {
  const targetIso = params.targetIso;
  const decision = params.decision;   // "DISETUJUI" atau "DITOLAK"
  const tglMulai = params.tglMulai;   
  const tglSelesai = params.tglSelesai;

  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  const sheet = ss.getSheetByName(NAMA_SHEET_APPROVAL);
  const data = sheet.getDataRange().getValues();

  let rowFound = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === targetIso) {
      rowFound = i + 1;
      break;
    }
  }

  if (rowFound === -1) return createJsonResponse({ status: "error", message: "Data tidak ditemukan!" });

  sheet.getRange(rowFound, 6).setValue(decision);

  if (decision === "DISETUJUI") {
    sheet.getRange(rowFound, 7).setValue(tglMulai);
    sheet.getRange(rowFound, 8).setValue(tglSelesai);
    return createJsonResponse({ status: "success", message: `Izin ${data[rowFound-1][2]} berhasil DISETUJUI.` });
  } else {
    return createJsonResponse({ status: "success", message: `Izin ${data[rowFound-1][2]} telah DITOLAK.` });
  }
}

// 3. FITUR BARU: Ambil Daftar Izin Aktif (Untuk Monitoring)
function getActiveLeaves() {
  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  const sheet = ss.getSheetByName(NAMA_SHEET_APPROVAL);
  if (!sheet) return createJsonResponse({ status: "empty", data: [] });

  const data = sheet.getDataRange().getValues();
  let activeList = [];
  const today = new Date();
  today.setHours(0,0,0,0);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[5]).toUpperCase();
    const statusSelesai = String(row[8] || "").toLowerCase(); // Kolom I
    const tglSelesai = row[7] ? new Date(row[7]) : null;

    // Tampilkan jika: DISETUJUI + Belum ada tulisan "izin selesai" + Tanggal belum lewat
    if (status === "DISETUJUI" && !statusSelesai.includes("izin selesai")) {
      if (tglSelesai && tglSelesai >= today) {
         activeList.push({
          iso: row[0],
          nama: row[2],
          tipe: row[3],
          tglSelesai: Utilities.formatDate(tglSelesai, TIMEZONE, "dd MMM yyyy")
        });
      }
    }
  }
  return createJsonResponse({ status: "success", data: activeList });
}

// 4. FITUR BARU: Force Finish (Selesaikan Izin Sekarang)
function forceFinishLeave(params) {
  const targetIso = params.targetIso;

  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  const sheet = ss.getSheetByName(NAMA_SHEET_APPROVAL);
  const data = sheet.getDataRange().getValues();

  let rowFound = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === targetIso) {
      rowFound = i + 1;
      break;
    }
  }

  if (rowFound === -1) return createJsonResponse({ status: "error", message: "Data tidak ditemukan!" });

  // Tulis "Izin Selesai" di Kolom I (Index 9 di Sheet)
  sheet.getRange(rowFound, 9).setValue("Izin Selesai");
  
  // --- PERBAIKAN DI SINI: PAKSA SIMPAN SEKARANG ---
  SpreadsheetApp.flush(); 
  // ------------------------------------------------

  return createJsonResponse({ status: "success", message: "Status izin berhasil diselesaikan." });
}

// ==========================================
// LOGIKA HISTORY & DASHBOARD GURU
// ==========================================

function getHistoryForTeacher(teacherName, dataAbsen, dataApproval) {
    const today = new Date();
    const currentMonthStr = Utilities.formatDate(today, TIMEZONE, "yyyy-MM"); 
    const todayStr = Utilities.formatDate(today, TIMEZONE, "yyyy-MM-dd"); 

    let history = [];

    // Helper agar Sorting (new Date()) tidak error jika value adalah Object Date
    const getSortableISO = (val) => {
        if (!val) return Utilities.formatDate(today, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
        if (val instanceof Date) return Utilities.formatDate(val, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
        return String(val);
    };

    // --- BAGIAN A: ABSENSI HARIAN ---
    if (dataAbsen.length > 1) {
        history = history.concat(
            dataAbsen.slice(1)
            .filter(r => r[2] === teacherName && getFormattedDateString(r[0], "yyyy-MM") === currentMonthStr)
            .map(r => ({ isoTimestamp: getSortableISO(r[0]), nama: r[2], keterangan: r[3] }))
        );
    }

    // --- BAGIAN B: DATA APPROVAL (IZIN) ---
    if (dataApproval.length > 1) {
        const teacherApprovals = dataApproval.slice(1).filter(r => r[2] === teacherName);
        
        teacherApprovals.forEach(row => {
            const submissionMonth = getFormattedDateString(row[0], "yyyy-MM");
            const status = String(row[5]).toUpperCase();
            const rawStart = row[6]; 
            const rawEnd = row[7];    
            const tipe = row[3];
            
            // Cek Kolom I (Index 8) untuk fitur "Izin Selesai"
            const statusSelesaiRaw = String(row[8] || "").toLowerCase();
            const isFinishedEarly = statusSelesaiRaw.includes("izin selesai");
            
            // 1. Masukkan ke List Riwayat jika diajukan BULAN INI
            if (submissionMonth === currentMonthStr) {
                 let label = `PENGAJUAN - ${tipe} [${status}]`;
                 history.push({ isoTimestamp: getSortableISO(row[0]), nama: teacherName, keterangan: label });
            }

            // 2. LOGIKA DASHBOARD (KARTU HIJAU)
            if (status === "DISETUJUI" && rawStart && rawEnd) {
                const startDate = new Date(rawStart);
                const endDate = new Date(rawEnd);
                const checkDate = new Date(todayStr); 
                startDate.setHours(0,0,0,0); endDate.setHours(23,59,59,999); checkDate.setHours(12,0,0,0); 

                // Jika Hari Ini masuk dalam rentang izin
                if (checkDate >= startDate && checkDate <= endDate) {
                    // Jika Admin BELUM menulis "Izin Selesai", maka tampilkan Kartu Hijau
                    // Jika SUDAH ada "Izin Selesai", jangan push data ini (biar guru bisa absen)
                    if (!isFinishedEarly) {
                        const tglSelesaiStr = Utilities.formatDate(endDate, TIMEZONE, "d MMMM yyyy");
                        history.push({ 
                            isoTimestamp: new Date().toISOString(), 
                            nama: teacherName, 
                            keterangan: `PENGAJUAN - ${tipe} [DISETUJUI] | ${tglSelesaiStr}` 
                        });
                    }
                }
            }
        });
    }

    // Sort: Terbaru di atas
    return history.sort((a, b) => new Date(b.isoTimestamp) - new Date(a.isoTimestamp));
}

// ==========================================
// --- UTILS & HELPERS ---
// ==========================================

// --- TAMBAHAN FUNGSI: Ekstrak Format Tanggal yang Aman dari Spreadsheet ---
function getFormattedDateString(val, format) {
  if (!val) return "";
  // Jika Spreadsheets mengubah ISO Text menjadi object Javascript Date:
  if (val instanceof Date) return Utilities.formatDate(val, TIMEZONE, format);
  
  // Jika tetap berupa String teks (seperti "2023-10-01T...")
  const str = String(val);
  if (format === "yyyy-MM-dd") return str.substring(0, 10);
  if (format === "yyyy-MM") return str.substring(0, 7);
  return str;
}
// ----------------------------------------

// --- TAMBAHAN FUNGSI: Cek Hari Libur ---
function cekHariLibur() {
  // Buka Spreadsheet Absen, asumsi sheet "Libur" ada di sana
  const ss = SpreadsheetApp.openById(ID_SS_ABSEN); 
  const sheet = ss.getSheetByName(NAMA_SHEET_LIBUR);
  
  // Jika sheet belum ada, asumsikan bukan hari libur
  if (!sheet) return { isLibur: false, namaLibur: "", tglSelesaiStr: "" };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { isLibur: false, namaLibur: "", tglSelesaiStr: "" }; // Jika cuma ada header

  // PERBAIKAN: Gunakan format string agar perbandingan tanggal aman dari masalah Timezone/UTC offset
  const todayStr = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");

  // Looping mulai dari baris kedua (Index 1) karena baris pertama adalah Header
  for (let i = 1; i < data.length; i++) {
    const namaLibur = data[i][1]; // Kolom B: Libur Apa
    const tglMulai = new Date(data[i][2]); // Kolom C: Tanggal mulai
    const tglSelesai = new Date(data[i][3]); // Kolom D: Tanggal selesai
    const status = String(data[i][4]).toLowerCase().trim(); // Kolom E: Status

    // Pastikan tglMulai dan tglSelesai formatnya valid
    if (isNaN(tglMulai.getTime()) || isNaN(tglSelesai.getTime())) continue;

    // Ekstrak string tanggal mulai dan selesai
    const startStr = Utilities.formatDate(tglMulai, TIMEZONE, "yyyy-MM-dd");
    const endStr = Utilities.formatDate(tglSelesai, TIMEZONE, "yyyy-MM-dd");

    // Cek apakah: Hari ini berada di dalam rentang waktu string DAN Statusnya "Libur"
    if (status === "libur" && todayStr >= startStr && todayStr <= endStr) {
      // Format tanggal selesai menjadi format yang mudah dibaca, contoh: "17/08/2024"
      const formatTglSelesai = Utilities.formatDate(tglSelesai, TIMEZONE, "dd/MM/yyyy");
      return { isLibur: true, namaLibur: namaLibur, tglSelesaiStr: formatTglSelesai }; 
    }
  }

  // Jika perulangan selesai dan tidak ada yang cocok, berarti tidak libur
  return { isLibur: false, namaLibur: "", tglSelesaiStr: "" };
}
// ----------------------------------------

// --- FITUR BARU: Ambil Notifikasi ---
function getNotification() {
  const ss = SpreadsheetApp.openById(ID_SS_ABSEN);
  const sheet = ss.getSheetByName(NAMA_SHEET_NOTIFIKASI);

  if (!sheet) return createJsonResponse({ status: "empty", message: "" });

  // Ambil isi baris 2 kolom A (asumsi header di baris 1, pesan di baris 2)
  // Atau baris paling bawah yang ada isinya. Kita ambil baris terakhir saja:
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createJsonResponse({ status: "empty", message: "" });

  const data = sheet.getRange(lastRow, 1).getValue();

  // Jika kosong, kembalikan string kosong
  if (!data || String(data).trim() === "") {
     return createJsonResponse({ status: "empty", message: "" });
  }

  return createJsonResponse({ status: "success", message: String(data).trim() });
}

function createJsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function formatTimestampToIndonesian(date) { return Utilities.formatDate(date, TIMEZONE, "dd/MM/yyyy H:mm:ss"); }

function checkTodaysAttendance(records) {
  let hasIn = false, hasOut = false;
  records.forEach(r => { 
      if (r[3] === CONSTANTS.STATUS.MASUK || r[3] === CONSTANTS.STATUS.TERLAMBAT) hasIn = true; 
      if (r[3] === CONSTANTS.STATUS.PULANG) hasOut = true; 
  });
  return { hasIn, hasOut };
}

function determineAttendanceStatus(now, hasIn, hasOut) {
  const h = parseInt(Utilities.formatDate(now, TIMEZONE, "H"));
  const m = parseInt(Utilities.formatDate(now, TIMEZONE, "m"));
  const min = h * 60 + m;
  if (min >= JADWAL.PULANG_MULAI && min <= JADWAL.PULANG_AKHIR) { 
      if (hasOut) return "ALREADY_CLOCKED_OUT"; if (!hasIn) return "MUST_CLOCK_IN_FIRST"; return CONSTANTS.STATUS.PULANG;
  }
  if (min < JADWAL.PULANG_MULAI) {
      if (min >= JADWAL.MASUK_MULAI) {
          if (hasIn) return "ALREADY_CLOCKED_IN";
          if (min <= JADWAL.MASUK_AKHIR) return CONSTANTS.STATUS.MASUK; else return CONSTANTS.STATUS.TERLAMBAT;
      }
  }
  return "INVALID";
}

function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371e3; 
  const toRad = val => val * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}
