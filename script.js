"use strict";
console.log("RACING GAME JS LOADED");

// ===============================
// 1. العناصر الأساسية
// ===============================

const $ = id => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const TOTAL_LEVELS = 10;
let gameSoundEnabled = true;

const cars = [
    { name: "السيارة الزرقاء", price: 0, speed: 1, emoji: "🚙", color: "#2196f3" },
    { name: "السيارة الحمراء", price: 500, speed: 1.15, emoji: "🏎️", color: "#f44336" },
    { name: "السيارة الخضراء", price: 1000, speed: 1.3, emoji: "🚗", color: "#4caf50" },
    { name: "السيارة الذهبية", price: 1800, speed: 1.5, emoji: "🚘", color: "#ffd700" }
];

// السيارات الإضافية
cars.push(
    { name: "سيارة البرق", price: 2500, speed: 1.65, emoji: "🏎️", color: "#00e5ff" },
    { name: "سيارة النار", price: 3500, speed: 1.8, emoji: "🔥", color: "#ff5722" },
    { name: "سيارة الأسطورة", price: 5000, speed: 2, emoji: "🚀", color: "#e040fb" }
);

const defaultSave = {
    coins: 0,
    bestScore: 0,
    selectedCar: 0,
    ownedCars: [0],
    unlockedLevel: 1,
    carColor: "#2196f3",
    controlMode: "buttons",
    upgrades: {
        speed: 1,
        nitro: 1,
        shield: 1
    }
};

function loadSave() {
    try {
        const stored = JSON.parse(localStorage.getItem("racingProSave"));

        if (!stored) return structuredClone(defaultSave);

        return {
            ...structuredClone(defaultSave),
            ...stored,
            ownedCars: Array.isArray(stored.ownedCars) ? stored.ownedCars : [0],
            controlMode: stored.controlMode === "tilt" ? "tilt" : "buttons",
            upgrades: {
                ...defaultSave.upgrades,
                ...(stored.upgrades || {})
            }
        };
    } catch {
        return structuredClone(defaultSave);
    }
}

let save = loadSave();

save.ownedCars = [...new Set(
    save.ownedCars.filter(i => Number.isInteger(i) && i >= 0 && i < cars.length)
)];

if (!save.ownedCars.includes(0)) save.ownedCars.push(0);

if (
    !Number.isInteger(save.selectedCar) ||
    save.selectedCar < 0 ||
    save.selectedCar >= cars.length ||
    !save.ownedCars.includes(save.selectedCar)
) {
    save.selectedCar = 0;
}

save.carColor = cars[save.selectedCar].color;

function saveGame() {
    try {
        localStorage.setItem("racingProSave", JSON.stringify(save));
    } catch (error) {
        console.warn("تعذر حفظ التقدم", error);
    }
}

saveGame();

// ===============================
// 2. حالة اللعبة
// ===============================

let selectedLevel = 1;
let selectedTrack = "day";
let difficultyMultiplier = 1;

let running = false;
let paused = false;
let finished = false;
let countdownRunning = false;

let score = 0;
let raceCoins = 0;
let timeLeft = 60;

let nitroEnergy = 100;
let nitroTimer = 0;

let shieldActive = false;
let magnetActive = false;
let shieldTimer = 0;
let magnetTimer = 0;
let shieldCharges = 1;

let roadOffset = 0;
let lastTime = 0;
let animationId = null;

let enemyTimer = 0;
let coinTimer = 0;

let enemies = [];
let coins = [];
let particles = [];
let environmentParticles = [];
let nitroEffectParticles = [];

let accelerationEffect = false;

const player = {
    x: 200,
    y: 510,
    width: 38,
    height: 65,
    move: 0
};

const racers = [
    { name: "أنت", progress: 0, speed: 1 },
    { name: "Lightning", progress: 0, speed: 1.1 },
    { name: "Shadow", progress: 0, speed: 1.2 },
    { name: "Turbo", progress: 0, speed: 0.95 }
];

let records = [];

try {
    records = JSON.parse(localStorage.getItem("racingProRecords")) || [];
    if (!Array.isArray(records)) records = [];
} catch {
    records = [];
}

// ===============================
// 3. الصوت والمؤثرات
// ===============================

let audioContext = null;

function playGameSound(frequency = 440, duration = 0.12, type = "sine") {
    if (!gameSoundEnabled) return;

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioContext) audioContext = new AudioContextClass();

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        gain.gain.setValueAtTime(0.08, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.warn("الصوت غير متاح", error);
    }
}

// ===============================
// 4. الطقس المتغير
// ===============================

const weatherTypes = [
    { name: "طقس مشمس ☀️", overlay: null },
    { name: "طقس ممطر 🌧️", overlay: "rain" },
    { name: "ضباب 🌫️", overlay: "fog" },
    { name: "ليل هادئ 🌙", overlay: "night" }
];

let currentWeather = weatherTypes[0];

function chooseWeather() {
    currentWeather = weatherTypes[
        Math.floor(Math.random() * weatherTypes.length)
    ];

    const label = $("weatherName");
    if (label) label.textContent = currentWeather.name;
}

function drawWeatherEffect() {
    if (currentWeather.overlay === "rain") {
        ctx.save();
        ctx.strokeStyle = "rgba(180,220,255,.55)";
        ctx.lineWidth = 1;

        for (let i = 0; i < 55; i++) {
            const x = (i * 73 + roadOffset * 2) % 400;
            const y = (i * 97 + roadOffset * 4) % 600;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 5, y + 13);
            ctx.stroke();
        }

        ctx.restore();
    }

    if (currentWeather.overlay === "fog") {
        ctx.fillStyle = "rgba(220,235,245,.22)";
        ctx.fillRect(55, 0, 290, 600);
    }

    if (currentWeather.overlay === "night") {
        ctx.fillStyle = "rgba(5,10,35,.34)";
        ctx.fillRect(55, 0, 290, 600);
    }
}

// ===============================
// 5. نظام التحكم
// ===============================

let controlMode = save.controlMode || "buttons";

let tiltEnabled = false;
let tiltBaseline = null;
let tiltCenterX = 200;
let tiltTargetX = 200;

function updateControlInterface() {
    $("controlMode").value = controlMode;

    const leftButton = $("leftBtn");
    const rightButton = $("rightBtn");
    const hint = $("controlHint");

    if (controlMode === "buttons") {
        leftButton.classList.remove("hidden");
        rightButton.classList.remove("hidden");
        hint.textContent = "استخدم أزرار اليمين واليسار للتحرك.";
    } else {
        leftButton.classList.add("hidden");
        rightButton.classList.add("hidden");

        hint.textContent =
            "أمِل الهاتف يمينًا أو يسارًا لتحريك السيارة. " +
            "حافظ على الهاتف في وضع مستقيم عند بداية التحكم.";
    }
}

function stopTiltControl() {
    window.removeEventListener("deviceorientation", handleDeviceOrientation);
    tiltEnabled = false;
    tiltBaseline = null;
}

function handleDeviceOrientation(event) {
    if (!tiltEnabled || controlMode !== "tilt") return;
    if (event.gamma === null || event.gamma === undefined) return;

    const gamma = Number(event.gamma);
    if (!Number.isFinite(gamma)) return;

    if (tiltBaseline === null) {
        tiltBaseline = gamma;
        tiltCenterX = player.x;
        tiltTargetX = player.x;
        return;
    }

    let difference = gamma - tiltBaseline;
    difference = Math.max(-30, Math.min(30, difference));

    tiltTargetX = tiltCenterX + difference * 8;
    tiltTargetX = Math.max(80, Math.min(320, tiltTargetX));
}

async function enableTiltControl() {
    if (!("DeviceOrientationEvent" in window)) {
        alert("مستشعر حركة الهاتف غير مدعوم. سيتم الرجوع إلى الأزرار.");

        controlMode = "buttons";
        save.controlMode = controlMode;
        saveGame();
        updateControlInterface();
        return;
    }

    try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
            const permission = await DeviceOrientationEvent.requestPermission();

            if (permission !== "granted") {
                throw new Error("لم يتم السماح باستخدام مستشعر الحركة");
            }
        }

        stopTiltControl();

        tiltBaseline = null;
        tiltCenterX = player.x;
        tiltTargetX = player.x;
        tiltEnabled = true;

        window.addEventListener("deviceorientation", handleDeviceOrientation);

        controlMode = "tilt";
        save.controlMode = "tilt";
        saveGame();
        updateControlInterface();

        $("controlHint").textContent =
            "تم تفعيل التحكم بالإمالة. أمِل الهاتف يمينًا ويسارًا.";
    } catch (error) {
        console.warn("تعذر تشغيل مستشعر الحركة:", error);

        stopTiltControl();
        controlMode = "buttons";
        save.controlMode = "buttons";

        saveGame();
        updateControlInterface();

        alert("لم نتمكن من تفعيل مستشعر الحركة. استخدم الأزرار.");
    }
}

function setControlMode(mode) {
    if (mode === "tilt") {
        enableTiltControl();
        return;
    }

    stopTiltControl();
    controlMode = "buttons";
    save.controlMode = "buttons";

    saveGame();
    updateControlInterface();
}

$("controlMode").addEventListener("change", event => {
    setControlMode(event.target.value);
});

// ===============================
// 6. الصعوبة والمراحل
// ===============================

function levelGoal(level) {
    return 50 + (level - 1) * 15;
}

function setDifficulty(value) {
    if (value === "easy") {
        difficultyMultiplier = 0.65;
    } else if (value === "hard") {
        difficultyMultiplier = 1.4;
    } else {
        difficultyMultiplier = 1;
    }
}

$("difficultySelect").addEventListener("change", event => {
    setDifficulty(event.target.value);
});

function displayLevels() {
    const container = $("levelsList");
    container.innerHTML = "";

    for (let i = 1; i <= TOTAL_LEVELS; i++) {
        const button = document.createElement("button");

        button.className = "level-btn";
        button.textContent = "مرحلة " + i;
        button.disabled = i > save.unlockedLevel;

        if (i === selectedLevel) button.classList.add("active");

        button.addEventListener("click", () => {
            selectedLevel = i;
            displayLevels();

            $("levelProgress").textContent =
                `هدف المرحلة: ${levelGoal(i)} نقطة`;
        });

        container.appendChild(button);
    }

    $("levelProgress").textContent =
        `المرحلة ${selectedLevel} - الهدف ${levelGoal(selectedLevel)} نقطة`;
}

// ===============================
// 7. تحديث بيانات اللاعب
// ===============================

function updateHeader() {
    $("coins").textContent = save.coins;
    $("bestScore").textContent = save.bestScore;

    $("nitroFill").style.width = nitroEnergy + "%";
    $("nitroText").textContent = Math.floor(nitroEnergy) + "%";

    $("raceCoins").textContent = raceCoins;
    $("score").textContent = Math.floor(score);
    $("raceTime").textContent = Math.ceil(timeLeft);

    $("upgradeInfo").textContent =
        `السرعة: ${save.upgrades.speed}/3 | ` +
        `النيترو: ${save.upgrades.nitro}/3 | ` +
        `الدرع: ${save.upgrades.shield}/3`;
}

// ===============================
// 8. الجراج
// ===============================

function displayShop() {
    const shop = $("carShop");

    shop.innerHTML = cars.map((car, index) => {
        const owned = save.ownedCars.includes(index);
        const selected = save.selectedCar === index;

        let buttonText;

        if (selected) {
            buttonText = "السيارة الحالية";
        } else if (owned) {
            buttonText = "اختيار السيارة";
        } else {
            buttonText = `شراء - ${car.price} عملة`;
        }

        return `
            <div class="car-card ${selected ? "selected" : ""}">
                <div class="car-preview" style="color:${car.color}">
                    ${car.emoji}
                </div>

                <h3>${car.name}</h3>
                <p>السرعة: ${car.speed}x</p>
                <p>${owned ? "مملوكة ✔️" : "غير مملوكة 🔒"}</p>

                <button data-car="${index}" ${selected ? "disabled" : ""}>
                    ${buttonText}
                </button>
            </div>
        `;
    }).join("");

    shop.querySelectorAll("[data-car]").forEach(button => {
        button.addEventListener("click", () => {
            selectCar(Number(button.dataset.car));
        });
    });
}

function selectCar(index) {
    const car = cars[index];
    if (!car) return;

    const owned = save.ownedCars.includes(index);

    if (!owned) {
        if (save.coins < car.price) {
            alert("رصيدك من العملات غير كافٍ!");
            return;
        }

        save.coins -= car.price;
        save.ownedCars.push(index);
    }

    save.selectedCar = index;
    save.carColor = car.color;

    saveGame();
    updateHeader();
    displayShop();
}

// ===============================
// 9. تطوير السيارات
// ===============================

function upgrade(type) {
    const costs = {
        speed: 300,
        nitro: 500,
        shield: 700
    };

    if (!costs[type]) return;

    if (save.upgrades[type] >= 3) {
        alert("وصلت إلى أعلى مستوى للتطوير!");
        return;
    }

    if (save.coins < costs[type]) {
        alert("لا توجد عملات كافية!");
        return;
    }

    save.coins -= costs[type];
    save.upgrades[type]++;

    saveGame();
    updateHeader();

    alert("تم التطوير بنجاح!");
}

$("speedUpgrade").addEventListener("click", () => upgrade("speed"));
$("nitroUpgrade").addEventListener("click", () => upgrade("nitro"));
$("shieldUpgrade").addEventListener("click", () => upgrade("shield"));

// ===============================
// 10. سجل النتائج
// ===============================

function displayRecords() {
    const list = $("leaderboardList");

    if (!records.length) {
        list.innerHTML = "<p>لا توجد نتائج حتى الآن</p>";
        return;
    }

    list.innerHTML = records.slice(0, 10).map((record, index) => `
        <div class="ranking-player">
            <span>${index + 1}. المرحلة ${record.level}</span>
            <strong>${record.score} نقطة</strong>
        </div>
    `).join("");
}


// عرض أفضل 10 نتائج محفوظة أونلاين على Firebase
async function displayOnlineLeaderboard() {
    const list = $("onlineLeaderboard");
    if (!list) return;

    list.textContent = "جاري تحميل النتائج...";

    try {
        if (!window.firebaseDB || typeof window.firebaseDB.getTopScores !== "function") {
            list.textContent = "الاتصال بقاعدة البيانات غير متاح حاليًا.";
            return;
        }

        const results = await window.firebaseDB.getTopScores(10);
        list.innerHTML = "";

        if (!results.length) {
            list.textContent = "لا توجد نتائج أونلاين حتى الآن.";
            return;
        }

        results.forEach((record, index) => {
            const row = document.createElement("div");
            row.className = "ranking-player";

            const playerName = document.createElement("span");
            playerName.textContent = `${index + 1}. ${record.playerName || "متسابق"}`;

            const playerScore = document.createElement("strong");
            playerScore.textContent = `${Number(record.score) || 0} نقطة`;

            row.append(playerName, playerScore);
            list.appendChild(row);
        });
    } catch (error) {
        console.error("خطأ في تحميل المتصدرين أونلاين:", error);
        list.textContent = "تعذر تحميل النتائج. تأكد من اتصال الإنترنت ثم اضغط تحديث.";
    }
}

$("refreshOnlineLeaderboard").addEventListener("click", displayOnlineLeaderboard);

function addRecord() {
    records.push({
        level: selectedLevel,
        score: Math.floor(score),
        date: new Date().toLocaleDateString("ar-EG")
    });

    records.sort((a, b) => b.score - a.score);
    records = records.slice(0, 10);

    try {
        localStorage.setItem("racingProRecords", JSON.stringify(records));
    } catch (error) {
        console.warn("تعذر حفظ النتائج", error);
    }

    displayRecords();
}

$("clearRecordsBtn").addEventListener("click", () => {
    if (!confirm("هل تريد مسح كل النتائج؟")) return;

    records = [];

    try {
        localStorage.removeItem("racingProRecords");
    } catch {}

    displayRecords();
});

// ===============================
// 11. المضامير والبيئة
// ===============================

document.querySelectorAll(".track-btn").forEach(button => {
    button.addEventListener("click", () => {
        selectedTrack = button.dataset.track;

        document.querySelectorAll(".track-btn").forEach(btn => {
            btn.classList.toggle("active", btn === button);
        });

        $("menuTrack").value = selectedTrack;
        environmentParticles = [];

        drawGame();
    });
});

function drawEnvironment() {
    if (selectedTrack === "city") {
        drawCityEnvironment();
    } else if (selectedTrack === "desert") {
        drawDesertEnvironment();
    } else if (selectedTrack === "snow") {
        drawSnowEnvironment();
    } else {
        drawDayEnvironment();
    }
}

function drawCityEnvironment() {
    ctx.fillStyle = "#11182d";
    ctx.fillRect(0, 0, 400, 600);

    for (let i = 0; i < 7; i++) {
        const y = ((i * 110 + roadOffset * 0.5) % 700) - 100;

        ctx.fillStyle = "#263653";
        ctx.fillRect(5, y, 42, 75);
        ctx.fillRect(353, y, 42, 75);

        ctx.fillStyle = "#ffe082";

        for (let j = 0; j < 3; j++) {
            ctx.fillRect(12 + j * 12, y + 12, 5, 8);
            ctx.fillRect(360 + j * 12, y + 12, 5, 8);
        }
    }
}

function drawDesertEnvironment() {
    ctx.fillStyle = "#b87936";
    ctx.fillRect(0, 0, 400, 600);

    for (let i = 0; i < 8; i++) {
        const y = ((i * 90 + roadOffset) % 700) - 100;

        ctx.fillStyle = "#e5ae63";

        ctx.beginPath();
        ctx.arc(25, y, 13, 0, Math.PI * 2);
        ctx.arc(375, y + 30, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#42652e";
        ctx.fillRect(22, y - 12, 5, 20);
        ctx.fillRect(371, y + 18, 5, 20);
    }
}

function drawSnowEnvironment() {
    ctx.fillStyle = "#d9efff";
    ctx.fillRect(0, 0, 400, 600);

    if (environmentParticles.length < 50) {
        environmentParticles.push({
            x: Math.random() * 400,
            y: -5,
            size: Math.random() * 3 + 1,
            speed: Math.random() * 2 + 1
        });
    }

    environmentParticles.forEach(p => {
        p.y += p.speed;
        p.x += Math.sin(p.y * 0.02);

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    environmentParticles = environmentParticles.filter(p => p.y < 610);
}

function drawDayEnvironment() {
    ctx.fillStyle = "#237b38";
    ctx.fillRect(0, 0, 400, 600);

    for (let i = 0; i < 7; i++) {
        const y = ((i * 100 + roadOffset) % 700) - 100;

        ctx.fillStyle = "#754522";
        ctx.fillRect(12, y + 20, 10, 25);
        ctx.fillRect(367, y + 20, 10, 25);

        ctx.fillStyle = "#0b5726";

        ctx.beginPath();
        ctx.arc(17, y + 15, 18, 0, Math.PI * 2);
        ctx.arc(372, y + 15, 18, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ===============================
// 12. رسم الطريق والسيارات
// ===============================

function drawRoad() {
    ctx.fillStyle = "#30343a";
    ctx.fillRect(55, 0, 290, 600);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(55, 0, 5, 600);
    ctx.fillRect(340, 0, 5, 600);

    ctx.fillStyle = "#eeeeee";

    for (let y = -60; y < 650; y += 100) {
        const offset = (y + roadOffset) % 600;

        ctx.fillRect(150, offset, 5, 45);
        ctx.fillRect(245, offset, 5, 45);
    }
}

function drawCar(car, color, emoji = null) {
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(car.x - 17, car.y + 5, car.width + 4, car.height);

    ctx.fillStyle = color;
    ctx.fillRect(car.x - car.width / 2, car.y, car.width, car.height);

    ctx.fillStyle = "#151c29";
    ctx.fillRect(car.x - 13, car.y + 8, 26, 16);

    ctx.fillStyle = "#8eeaff";
    ctx.fillRect(car.x - 12, car.y + 10, 24, 12);

    ctx.fillStyle = "#151c29";
    ctx.fillRect(car.x - 12, car.y + 37, 24, 14);

    ctx.fillStyle = "#fff3a1";
    ctx.fillRect(car.x - 15, car.y + 2, 7, 5);
    ctx.fillRect(car.x + 8, car.y + 2, 7, 5);

    ctx.fillStyle = "#111";
    ctx.fillRect(car.x - 21, car.y + 12, 5, 15);
    ctx.fillRect(car.x + 16, car.y + 12, 5, 15);
    ctx.fillRect(car.x - 21, car.y + 43, 5, 15);
    ctx.fillRect(car.x + 16, car.y + 43, 5, 15);

    if (emoji) {
        ctx.fillStyle = "white";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(emoji, car.x, car.y - 5);
    }

    ctx.restore();
}

function drawCoin(coin) {
    ctx.save();

    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff4a3";
    ctx.beginPath();
    ctx.arc(coin.x - 3, coin.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ===============================
// 13. خط النهاية
// ===============================

function drawFinishLine() {
    if (score < levelGoal(selectedLevel) * 0.85) return;

    const y = 130;

    for (let x = 60; x < 340; x += 20) {
        for (let row = 0; row < 2; row++) {
            ctx.fillStyle = (x / 20 + row) % 2 === 0 ? "#fff" : "#111";
            ctx.fillRect(x, y + row * 12, 20, 12);
        }
    }

    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("FINISH", 200, y - 12);
}

// ===============================
// 14. مؤثرات النيترو والدرع
// ===============================

function drawPowerEffects() {
    if (shieldActive) {
        ctx.strokeStyle = "#00eaff";
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.ellipse(player.x, player.y + 30, 33, 42, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (magnetActive) {
        ctx.strokeStyle = "#d500f9";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(player.x, player.y + 30, 55, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function createSmoke() {
    for (let i = 0; i < 2; i++) {
        particles.push({
            x: player.x + (Math.random() - 0.5) * 25,
            y: player.y + 60,
            vx: (Math.random() - 0.5) * 1.5,
            vy: Math.random() * 2 + 1,
            life: 1,
            size: Math.random() * 5 + 3,
            color: "#aaaaaa"
        });
    }
}

function createNitroEffect() {
    for (let i = 0; i < 3; i++) {
        nitroEffectParticles.push({
            x: player.x + (Math.random() - 0.5) * 25,
            y: player.y + 60,
            size: Math.random() * 8 + 4,
            life: 1
        });
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        p.size += 0.05;
    });

    particles = particles.filter(p => p.life > 0);

    nitroEffectParticles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = "#00d9ff";

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();

        p.y += 4;
        p.life -= 0.04;
    });

    nitroEffectParticles = nitroEffectParticles.filter(p => p.life > 0);
    ctx.globalAlpha = 1;
}

function createCrashEffect() {
    for (let i = 0; i < 18; i++) {
        particles.push({
            x: player.x,
            y: player.y + 30,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 1,
            size: Math.random() * 5 + 2,
            color: "#ffb300"
        });
    }
}

// ===============================
// 15. رسم اللعبة
// ===============================

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawEnvironment();
    drawRoad();
    drawWeatherEffect();
    drawFinishLine();

    coins.forEach(drawCoin);

    enemies.forEach(enemy => {
        drawCar(enemy, enemy.color, enemy.name);
    });

    const selectedCar = cars[save.selectedCar] || cars[0];

    drawCar(player, save.carColor || selectedCar.color);

    drawPowerEffects();
    drawParticles();
}

// ===============================
// 16. إنشاء المنافسين والعملات
// ===============================

function createEnemy() {
    const lanes = [100, 200, 300];
    const names = ["AI", "RIVAL", "PRO", "FAST"];

    const x = lanes[Math.floor(Math.random() * lanes.length)];

    const colors = ["#f44336", "#9c27b0", "#ff9800", "#eeeeee"];

    enemies.push({
        x,
        y: -80,
        width: 38,
        height: 65,
        speed: 180 + Math.random() * 90 * difficultyMultiplier,
        color: colors[Math.floor(Math.random() * colors.length)],
        name: names[Math.floor(Math.random() * names.length)]
    });
}

function createCoin() {
    const lanes = [100, 200, 300];

    coins.push({
        x: lanes[Math.floor(Math.random() * lanes.length)],
        y: -20,
        radius: 10
    });
}

function rectanglesCollide(a, b) {
    return (
        a.x - a.width / 2 < b.x + b.width / 2 &&
        a.x + a.width / 2 > b.x - b.width / 2 &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

// ===============================
// 17. ترتيب المتسابقين
// ===============================

function updateRaceRanking() {
    const ranking = $("raceRanking");

    const sorted = [...racers].sort((a, b) => b.progress - a.progress);

    ranking.innerHTML = sorted.map((racer, index) => `
        <div class="ranking-player">
            <span>${index + 1}. ${racer.name}</span>
            <strong>${Math.floor(racer.progress)}%</strong>
        </div>
    `).join("");
}

// ===============================
// 18. قدرات اللاعب
// ===============================

function useNitro() {
    if (!running || paused || finished) return;
    if (nitroEnergy <= 0 || nitroTimer > 0) return;

    nitroTimer = 3;
    playGameSound(850, 0.25, "sawtooth");
}

function activateShield() {
    if (!running || paused || finished) return;
    if (shieldActive || shieldCharges <= 0) return;

    shieldActive = true;
    shieldTimer = 5;
    shieldCharges--;

    playGameSound(650, 0.2, "triangle");
}

function activateMagnet() {
    if (!running || paused || finished) return;
    if (magnetActive) return;

    magnetActive = true;
    magnetTimer = 6;

    playGameSound(500, 0.2, "sine");
}

// ===============================
// 19. تحريك السيارة
// ===============================

function moveLeft() {
    if (!running || paused || finished) return;
    if (controlMode !== "buttons") return;

    player.x = Math.max(80, player.x - 28);
}

function moveRight() {
    if (!running || paused || finished) return;
    if (controlMode !== "buttons") return;

    player.x = Math.min(320, player.x + 28);
}

$("leftBtn").addEventListener("pointerdown", event => {
    event.preventDefault();
    moveLeft();
});

$("rightBtn").addEventListener("pointerdown", event => {
    event.preventDefault();
    moveRight();
});

$("nitroBtn").addEventListener("click", useNitro);
$("shieldBtn").addEventListener("click", activateShield);
$("magnetBtn").addEventListener("click", activateMagnet);

// ===============================
// 20. لوحة المفاتيح
// ===============================

window.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
        event.preventDefault();
    }

    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        moveLeft();
    }

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        moveRight();
    }

    if (event.key === "ArrowUp") {
        accelerationEffect = true;
        useNitro();
    }

    if (event.key === "Escape") pauseGame();
});

window.addEventListener("keyup", event => {
    if (event.key === "ArrowUp") accelerationEffect = false;
});

// ===============================
// 21. التحدي اليومي
// ===============================

const DAILY_TARGET = 5;
const DAILY_REWARD = 150;

function getTodayKey() {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}

function loadDailyData() {
    try {
        const data = JSON.parse(localStorage.getItem("racingDailyChallenge"));

        if (data && data.date === getTodayKey()) return data;
    } catch {}

    return {
        date: getTodayKey(),
        progress: 0,
        claimed: false
    };
}

let dailyData = loadDailyData();

function saveDailyData() {
    try {
        localStorage.setItem("racingDailyChallenge", JSON.stringify(dailyData));
    } catch (error) {
        console.warn("تعذر حفظ التحدي اليومي", error);
    }
}

function updateDailyChallenge() {
    const fill = $("dailyProgressFill");
    const progressText = $("dailyProgressText");
    const claimButton = $("dailyClaimBtn");
    const status = $("dailyStatus");

    if (!fill || !progressText || !claimButton || !status) return;

    const progress = Math.min(dailyData.progress, DAILY_TARGET);

    fill.style.width = (progress / DAILY_TARGET * 100) + "%";
    progressText.textContent = `${progress} / ${DAILY_TARGET}`;

    claimButton.disabled = progress < DAILY_TARGET || dailyData.claimed;

    if (dailyData.claimed) {
        claimButton.textContent = "تم استلام المكافأة ✔️";
        status.textContent = "أحسنت! يمكنك العودة غدًا لتحدٍ جديد.";
    } else if (progress >= DAILY_TARGET) {
        claimButton.textContent = "🎁 استلام 150 عملة";
        status.textContent = "اكتمل التحدي! استلم مكافأتك.";
    } else {
        claimButton.textContent = "🎁 استلام المكافأة";
        status.textContent = "اجمع العملات لإكمال التحدي.";
    }
}

function addDailyProgress(amount) {
    if (dailyData.claimed) return;

    dailyData.progress = Math.min(
        DAILY_TARGET,
        dailyData.progress + amount
    );

    saveDailyData();
    updateDailyChallenge();
}

$("dailyClaimBtn").addEventListener("click", () => {
    if (dailyData.claimed || dailyData.progress < DAILY_TARGET) return;

    dailyData.claimed = true;
    save.coins += DAILY_REWARD;

    saveGame();
    saveDailyData();

    updateHeader();
    updateDailyChallenge();

    playGameSound(900, 0.3, "triangle");
});

// ===============================
// 22. تحديث السباق
// ===============================

function update(dt) {
    if (!running || paused || finished) return;

    if (controlMode === "tilt" && tiltEnabled) {
        const smoothAmount = Math.min(1, dt * 10);
        player.x += (tiltTargetX - player.x) * smoothAmount;
    }

    const selectedCar = cars[save.selectedCar] || cars[0];
    const carSpeed = selectedCar.speed * save.upgrades.speed;
    const speedFactor = nitroTimer > 0 ? 1.8 : 1;

    roadOffset += 230 * carSpeed * speedFactor * dt;
    roadOffset %= 600;

    score += dt * 3 * carSpeed * speedFactor;
    timeLeft -= dt;

    if (nitroTimer > 0) {
        nitroTimer -= dt;
        nitroEnergy = Math.max(0, nitroEnergy - 25 * dt);
        createNitroEffect();
    } else {
        const recharge = 8 + save.upgrades.nitro * 3;
        nitroEnergy = Math.min(100, nitroEnergy + recharge * dt);
    }

    if (shieldTimer > 0) {
        shieldTimer -= dt;

        if (shieldTimer <= 0) shieldActive = false;
    }

    if (magnetTimer > 0) {
        magnetTimer -= dt;

        if (magnetTimer <= 0) magnetActive = false;
    }

    enemyTimer += dt;
    coinTimer += dt;

    if (enemyTimer >= Math.max(0.65, 1.5 / difficultyMultiplier)) {
        createEnemy();
        enemyTimer = 0;
    }

    if (coinTimer >= 1.1) {
        createCoin();
        coinTimer = 0;
    }

    const enemySpeed = 220 * difficultyMultiplier * speedFactor;

    enemies.forEach(enemy => {
        enemy.y += (enemySpeed + enemy.speed) * dt;
    });

    enemies = enemies.filter(enemy => enemy.y < 680);

    coins.forEach(coin => {
        coin.y += 210 * dt;

        if (magnetActive) {
            const distance = Math.hypot(
                coin.x - player.x,
                coin.y - (player.y + 30)
            );

            if (distance < 120) {
                coin.x += (player.x - coin.x) * 0.08;
                coin.y += ((player.y + 30) - coin.y) * 0.08;
            }
        }
    });

    const previousCoins = raceCoins;

    coins = coins.filter(coin => {
        const distance = Math.hypot(
            coin.x - player.x,
            coin.y - (player.y + 30)
        );

        if (distance < 25) {
            raceCoins++;
            score += 10;
            return false;
        }

        return coin.y < 630;
    });

    // تحديث التحدي اليومي عند جمع العملات
    if (raceCoins > previousCoins) {
        const collected = raceCoins - previousCoins;
        addDailyProgress(collected);
        playGameSound(700, 0.09, "sine");
    }

    for (const enemy of enemies) {
        if (rectanglesCollide(player, enemy)) {
            if (shieldActive) {
                shieldActive = false;
                shieldTimer = 0;
                enemy.y = 700;

                createCrashEffect();
                continue;
            }

            createCrashEffect();
            finishGame("حدث اصطدام!");
            return;
        }
    }

    if (accelerationEffect && Math.random() < 0.3) {
        createSmoke();
    }

    racers[0].progress = Math.min(
        100,
        (score / levelGoal(selectedLevel)) * 100
    );

    for (let i = 1; i < racers.length; i++) {
        racers[i].progress = Math.min(
            100,
            racers[i].progress +
            racers[i].speed * difficultyMultiplier * dt * 2.5
        );
    }

    updateRaceRanking();
    updateHeader();

    if (score >= levelGoal(selectedLevel)) {
        finishGame("أكملت المرحلة بنجاح!");
        return;
    }

    if (timeLeft <= 0) {
        finishGame("انتهى الوقت!");
    }
}

// ===============================
// 23. حلقة تشغيل اللعبة
// ===============================

function gameLoop(timestamp) {
    if (!running || paused || finished) return;

    if (!lastTime) lastTime = timestamp;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.04);
    lastTime = timestamp;

    update(dt);
    drawGame();

    if (running && !paused && !finished) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// ===============================
// 24. العد التنازلي
// ===============================

function beginCountdown() {
    const countdown = $("countdown");
    const numbers = ["3", "2", "1", "انطلق!"];

    running = false;
    countdownRunning = true;

    countdown.classList.remove("hidden");

    let index = 0;

    function showNext() {
        countdown.textContent = numbers[index];
        index++;

        if (index < numbers.length) {
            setTimeout(showNext, 800);
        } else {
            setTimeout(() => {
                countdown.classList.add("hidden");
                countdownRunning = false;
                running = true;
                lastTime = 0;

                animationId = requestAnimationFrame(gameLoop);
            }, 600);
        }
    }

    showNext();
}

// ===============================
// 25. بداية السباق
// ===============================

function startGame() {
    if (running || countdownRunning) return;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    running = false;
    paused = false;
    finished = false;

    score = 0;
    raceCoins = 0;
    timeLeft = 60;

    nitroEnergy = 100;
    nitroTimer = 0;

    shieldActive = false;
    magnetActive = false;

    shieldTimer = 0;
    magnetTimer = 0;

    shieldCharges = save.upgrades.shield;

    roadOffset = 0;
    enemyTimer = 0;
    coinTimer = 0;

    enemies = [];
    coins = [];
    particles = [];
    nitroEffectParticles = [];
    environmentParticles = [];

    player.x = 200;

    tiltCenterX = player.x;
    tiltTargetX = player.x;
    tiltBaseline = null;

    racers.forEach(racer => {
        racer.progress = 0;
    });

    $("resultScreen").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");

    chooseWeather();

    updateHeader();
    updateRaceRanking();
    drawGame();

    beginCountdown();
}

// ===============================
// 26. نهاية السباق
// ===============================
async function saveOnlineRaceResult() {
    try {
        if (!window.firebaseDB) {
            console.warn("Firebase غير متصل");
            return;
        }

        await window.firebaseDB.saveRaceResult({
            playerName: "Player 1",
            score: Math.floor(score),
            coins: raceCoins,
            track: selectedTrack
        });

        console.log("تم حفظ النتيجة أونلاين");

    } catch (error) {
        console.error("خطأ في حفظ النتيجة:", error);
    }
}

function finishGame(reason) {
    if (finished) return;

    finished = true;
    running = false;
    paused = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    const won = score >= levelGoal(selectedLevel);

    if (won) {
        const reward = 100 + selectedLevel * 20;

        save.coins += reward + raceCoins;

        save.unlockedLevel = Math.min(
            TOTAL_LEVELS,
            Math.max(save.unlockedLevel, selectedLevel + 1)
        );

        $("resultTitle").textContent = "🏆 فوز رائع!";
        $("medalResult").textContent = "🥇";

        $("resultDetails").textContent =
            `${reason} حصلت على ${Math.floor(score)} نقطة، ` +
            `ومكافأتك ${reward + raceCoins} عملة.`;
    } else {
        save.coins += raceCoins;

        $("resultTitle").textContent = "انتهى السباق";
        $("medalResult").textContent = "🏁";

        $("resultDetails").textContent =
            `${reason} نقاطك: ${Math.floor(score)}. ` +
            `العملات التي جمعتها: ${raceCoins}.`;
    }

    save.bestScore = Math.max(save.bestScore, Math.floor(score));
    saveGame();
    addRecord();
    saveOnlineRaceResult();

    updateHeader();
    displayLevels();
    displayShop();

    $("resultScreen").classList.remove("hidden");
    $("pauseOverlay").classList.add("hidden");

    drawGame();
}

// ===============================
// 27. الإيقاف والاستكمال
// ===============================

function pauseGame() {
    if (countdownRunning || finished || !running) return;

    if (!paused) {
        paused = true;

        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        $("pauseOverlay").classList.remove("hidden");
    }
}

function resumeGame() {
    if (!paused || finished) return;

    paused = false;
    $("pauseOverlay").classList.add("hidden");

    lastTime = 0;
    animationId = requestAnimationFrame(gameLoop);
}

$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("startBtn").addEventListener("click", startGame);
$("restartBtn").addEventListener("click", startGame);

// ===============================
// 28. شاشة البداية
// ===============================

$("menuTrack").addEventListener("change", event => {
    selectedTrack = event.target.value;

    document.querySelectorAll(".track-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.track === selectedTrack
        );
    });

    environmentParticles = [];
    drawGame();
});

// زر بدء اللعب
$("menuPlayBtn").addEventListener("click", () => {
    $("mainMenu").style.display = "none";
    showPage("homePage");
    startGame();
});

// زر العودة للقائمة بعد انتهاء السباق
$("resultMenuBtn").addEventListener("click", () => {
    $("resultScreen").classList.add("hidden");
    $("mainMenu").style.display = "flex";

    showPage("homePage");
});

// ===============================
// 29. إعداد الصوت
// ===============================

function updateSoundButton() {
    $("soundToggle").textContent = gameSoundEnabled
        ? "🔊 الصوت: تشغيل"
        : "🔇 الصوت: إيقاف";
}

$("soundToggle").addEventListener("click", () => {
    gameSoundEnabled = !gameSoundEnabled;
    updateSoundButton();
});

// ===============================
// 30. التشغيل الأولي
// ===============================

setDifficulty($("difficultySelect").value);

displayLevels();
displayShop();
displayRecords();
updateHeader();
updateRaceRanking();
updateControlInterface();
updateDailyChallenge();
updateSoundButton();

drawGame();

$("menuTrack").value = selectedTrack;

if (controlMode === "tilt") {
    controlMode = "buttons";
    save.controlMode = "buttons";
    saveGame();
    updateControlInterface();
}

// ===============================
// 31. شريط التنقل السفلي
// ===============================

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        const isActive = page.id === pageId;

        page.classList.toggle("active-page", isActive);
        page.classList.toggle("hidden", !isActive);
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    if (pageId === "shopPage") displayShop();
    if (pageId === "resultsPage") {
        displayRecords();
        displayOnlineLeaderboard();
    }
    if (pageId === "challengesPage") displayLevels();

    updateHeader();
}

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => {
        const pageId = button.dataset.page;
        showPage(pageId);
    });
});

// فتح الصفحة الرئيسية عند تشغيل الموقع
showPage("homePage");