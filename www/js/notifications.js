/* File: js/notifications.js
   Fungsi: Notifikasi Jadwal Tetap + Auto-Open Scanner saat diklik
*/

document.addEventListener('deviceready', function () {
    console.log("Device Ready: Menginisialisasi Notifikasi...");

    // 1. Setup Listener Klik (INI BAGIAN PENTINGNYA)
    // Fungsi ini akan jalan otomatis saat notifikasi diklik
    cordova.plugins.notification.local.on('click', function (notification) {
        console.log("Notifikasi diklik! Membuka Scanner...");
        
        // Kita beri delay 1 detik agar aplikasi loading dulu sampai sempurna
        setTimeout(function() {
            // Cek apakah fungsi startScanner (dari app.js) tersedia
            if (typeof startScanner === 'function') {
                startScanner(); // <--- INI PERINTAH BUKA MODAL KAMERA
            } else {
                console.warn("Fungsi startScanner belum siap.");
            }
        }, 1000); 
    });

    // 2. Setup Tombol Tes
    var testBtn = document.getElementById('testNotifBtn');
    if (testBtn) {
        testBtn.addEventListener('click', triggerTestNotification);
    }

    // 3. Pasang Jadwal
    checkNotificationPermission(function() {
        createHighPriorityChannel();
        scheduleFixedNotifications();
    });

}, false);

function createHighPriorityChannel() {
    if (cordova.plugins.notification.local.createChannel) {
        cordova.plugins.notification.local.createChannel({
            id: 'absensi_channel_id',
            name: 'Notifikasi Absensi',
            importance: 4, visibility: 1, vibration: true, sound: true
        });
    }
}

function checkNotificationPermission(callback) {
    if (cordova.plugins.permissions) {
        var permissions = cordova.plugins.permissions;
        permissions.checkPermission(permissions.POST_NOTIFICATIONS, function(status){
            if(status.hasPermission){ if(callback) callback(); } 
            else {
                permissions.requestPermission(permissions.POST_NOTIFICATIONS, function(s) {
                    if(s.hasPermission && callback) callback();
                }, function() { console.warn("Izin ditolak."); });
            }
        });
    } else { if(callback) callback(); }
}

function scheduleFixedNotifications() {
    var notif = cordova.plugins.notification.local;

    notif.isScheduled(101, function(isScheduled) {
        if (isScheduled) { console.log("Jadwal sudah ada. Skip."); return; }

        var schoolDays = [1, 2, 3, 4, 5, 6]; 
        var notifications = [];

        schoolDays.forEach(function(day) {
            
            // --- JADWAL MASUK (06:30) ---
            notifications.push({
                id: 100 + day,
                title: '🔔 Waktunya Absen Masuk!',
                text: 'Sudah 06:30. Ketuk notifikasi ini untuk Scan QR.',
                
                channel: 'absensi_channel_id',
                priority: 2, foreground: true, wakeup: true, lockscreen: true, vibrate: true, allowWhileIdle: true,
                
                launch: true, // <--- WAJIB: Agar aplikasi terbuka saat diklik
                
                // Kita hapus bagian 'actions' agar bersih

                trigger: { every: { weekday: day, hour: 6, minute: 30 } }
            });

            // --- JADWAL PULANG (11:00) ---
            notifications.push({
                id: 200 + day,
                title: '👋 Waktunya Absen Pulang!',
                text: 'Sudah 11:00. Ketuk notifikasi ini untuk Scan QR.',
                
                channel: 'absensi_channel_id',
                priority: 2, foreground: true, wakeup: true, lockscreen: true, vibrate: true, allowWhileIdle: true,
                
                launch: true, // <--- WAJIB

                trigger: { every: { weekday: day, hour: 11, minute: 0 } }
            });
        });

        notif.schedule(notifications);
    });
}

function triggerTestNotification() {
    if (typeof showToast === 'function') showToast("Tunggu 2 detik, lalu klik notifikasinya...");
    else alert("Tunggu 2 detik, lalu klik notifikasinya...");

    cordova.plugins.notification.local.schedule({
        id: 999,
        title: '🔔 Tes Auto-Scanner',
        text: 'Klik saya! Kamera akan langsung terbuka.',
        channel: 'absensi_channel_id',
        foreground: true, wakeup: true, priority: 2, allowWhileIdle: true,
        
        launch: true, // Body bisa diklik

        trigger: { at: new Date(new Date().getTime() + 2000) } 
    });
}