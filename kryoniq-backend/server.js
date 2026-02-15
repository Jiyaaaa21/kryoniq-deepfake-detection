require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

// ============================== 
// EMAIL CONFIGURATION
// ============================== 
const EMAIL_DEBUG = true;

// ✅ kryoniq.com is verified in Resend — use this domain
const EMAIL_CONFIG = {
  from: "Kryoniq <noreply@kryoniq.com>",
};

function logEmail(type, message, data = null) {
  if (!EMAIL_DEBUG) return;
  const timestamp = new Date().toISOString();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[EMAIL ${type}] ${timestamp}`);
  console.log(message);
  if (data) console.log("Data:", JSON.stringify(data, null, 2));
  console.log("=".repeat(60) + "\n");
}

// ============================== 
// RESEND INIT
// ============================== 
let resend;
try {
  if (!process.env.RESEND_API_KEY) {
    logEmail("ERROR", "❌ RESEND_API_KEY is missing from environment variables!");
    throw new Error("RESEND_API_KEY not found");
  }
  resend = new Resend(process.env.RESEND_API_KEY);
  logEmail("INIT", "✅ Resend client initialized successfully", {
    apiKeyPresent: true,
    apiKeyPrefix: process.env.RESEND_API_KEY.substring(0, 7) + "...",
  });
} catch (error) {
  logEmail("ERROR", "❌ Failed to initialize Resend client", { error: error.message });
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ============================== 
// SUPABASE CLIENT
// ============================== 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================== 
// PATH SETUP
// ============================== 
const projectRoot = path.resolve(__dirname, "..");
const realBasePath = path.join(projectRoot, "public", "audio", "Real");
const clonedBasePath = path.join(projectRoot, "public", "audio", "Cloned");

// ============================== 
// UTILITY
// ============================== 
function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// ============================== 
// HEALTH CHECK
// ============================== 
app.get("/", (req, res) => {
  res.send("Kryoniq Backend Running");
});

// ===================================================== 
// CREATE USER
// ===================================================== 
app.post("/api/create-user", async (req, res) => {
  try {
    const { name, email, organization, phone, consent } = req.body;

    if (!name || !email || !organization) {
      return res.status(400).json({ error: "Name, email and organization are required" });
    }

    if (!consent) {
      return res.status(400).json({ error: "User consent is required" });
    }

    const { data: existingUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.json({ message: "User already exists", userId: existingUser.id });
    }

    const { data, error } = await supabase
      .from("app_users")
      .insert([{ name, email, organization, phone: phone || null, consent_given: true }])
      .select()
      .single();

    if (error) {
      console.error("User Insert Error:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }

    return res.status(201).json({ message: "User created successfully", userId: data.id });
  } catch (err) {
    console.error("Create User Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ===================================================== 
// START GAME
// ===================================================== 
app.get("/api/start-game", (req, res) => {
  try {
    if (!fs.existsSync(realBasePath)) throw new Error("Real audio folder not found");
    if (!fs.existsSync(clonedBasePath)) throw new Error("Cloned audio folder not found");

    const celebrities = fs.readdirSync(realBasePath);
    const shuffledCelebs = shuffle(celebrities).slice(0, 10);

    const rounds = shuffledCelebs.map((celebrity, index) => {
      const realFolder = path.join(realBasePath, celebrity);
      const clonedFolder = path.join(clonedBasePath, celebrity);

      const realFiles = fs.readdirSync(realFolder).filter((f) => f.toLowerCase().endsWith(".wav"));
      const clonedFiles = fs.readdirSync(clonedFolder).filter((f) => f.toLowerCase().endsWith(".wav"));

      if (!realFiles.length || !clonedFiles.length) {
        throw new Error(`Missing audio files for ${celebrity}`);
      }

      const realFile = realFiles[Math.floor(Math.random() * realFiles.length)];
      const clonedFile = clonedFiles[Math.floor(Math.random() * clonedFiles.length)];
      const realPosition = Math.random() > 0.5 ? "A" : "B";

      return {
        roundNumber: index + 1,
        celebrity,
        audioA: realPosition === "A"
          ? `/audio/Real/${celebrity}/${realFile}`
          : `/audio/Cloned/${celebrity}/${clonedFile}`,
        audioB: realPosition === "B"
          ? `/audio/Real/${celebrity}/${realFile}`
          : `/audio/Cloned/${celebrity}/${clonedFile}`,
        realPosition,
      };
    });

    res.json({ rounds });
  } catch (error) {
    console.error("Start Game Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// AUDIO FALLBACK
// =====================================================
// Called by useAudioFallback in Game.tsx when an <audio>
// element fires onError. Returns a random replacement file
// for the same celebrity + category, excluding the broken one.
//
// GET /api/audio-files/:celebrity?category=Real|Cloned&exclude=/audio/Real/Obama/clip01.wav
// Response: { filePath: "/audio/Real/Obama/clip03.wav" }
// =====================================================
app.get("/api/audio-files/:celebrity", (req, res) => {
  try {
    const { celebrity } = req.params;
    const { category, exclude } = req.query;

    if (!celebrity || typeof celebrity !== "string") {
      return res.status(400).json({ error: "Missing celebrity param" });
    }

    if (category !== "Real" && category !== "Cloned") {
      return res.status(400).json({ error: "category must be \'Real\' or \'Cloned\'" });
    }

    const basePath = category === "Real" ? realBasePath : clonedBasePath;
    const safeCelebrity = path.basename(celebrity);
    const folder = path.join(basePath, safeCelebrity);

    if (!fs.existsSync(folder)) {
      return res.status(404).json({ error: `No ${category} folder for ${safeCelebrity}` });
    }

    const allFiles = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".wav"));

    if (!allFiles.length) {
      return res.status(404).json({ error: `No wav files found for ${safeCelebrity}/${category}` });
    }

    let candidates = allFiles;
    if (exclude && typeof exclude === "string") {
      const brokenFilename = path.basename(exclude);
      const filtered = allFiles.filter((f) => f !== brokenFilename);
      if (filtered.length > 0) candidates = filtered;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const filePath = `/audio/${category}/${safeCelebrity}/${picked}`;

    console.log(`[AudioFallback] Replacement for ${safeCelebrity}/${category}: ${picked}`);
    return res.json({ filePath });
  } catch (error) {
    console.error("Audio Fallback Error:", error.message);
    return res.status(500).json({ error: "Failed to find replacement audio" });
  }
});

// ===================================================== 
// SUBMIT GAME
// ===================================================== 
app.post("/api/submit-game", async (req, res) => {
  try {
    const { userId, rounds } = req.body;

    if (!userId || !rounds || !Array.isArray(rounds)) {
      return res.status(400).json({ error: "Invalid submission data" });
    }

    const score = rounds.filter((r) => r.userChoice === r.realPosition).length;
    const totalReplays = rounds.reduce((sum, r) => sum + r.replayCountLeft + r.replayCountRight, 0);
    const sessionDuration = rounds.reduce((sum, r) => sum + r.timeSpent, 0);

    await supabase.from("game_sessions").insert([{
      user_id: userId,
      score,
      rounds,
      total_replays: totalReplays,
      session_duration: sessionDuration,
    }]);

    const { data: higherScores } = await supabase
      .from("game_sessions")
      .select("score")
      .gt("score", score);

    const leaderboardRank = (higherScores?.length || 0) + 1;

    const { data: statsData } = await supabase
      .from("global_stats")
      .select("*")
      .eq("id", 1)
      .single();

    let newHighScore = statsData.high_score;
    let newTotalGames = statsData.total_games + 1;

    if (score > newHighScore) newHighScore = score;

    await supabase
      .from("global_stats")
      .update({ high_score: newHighScore, total_games: newTotalGames, updated_at: new Date() })
      .eq("id", 1);

    // ── Send results email ────────────────────────────
    const { data: userData } = await supabase
      .from("app_users")
      .select("email, name")
      .eq("id", userId)
      .single();

    logEmail("ATTEMPT", "🔄 Starting email send process", {
      userId,
      userDataFound: !!userData,
      email: userData?.email,
      name: userData?.name,
      score,
      rank: leaderboardRank,
    });

    if (userData?.email) {
      try {
        logEmail("SENDING", "📧 Attempting to send email via Resend...", {
          to: userData.email,
          from: EMAIL_CONFIG.from,
          subject: "Your Kryoniq Results 🎮",
        });

        const emailResponse = await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: userData.email,
          subject: "Your Kryoniq Results 🎮",
          html: `
            <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Your Kryoniq Results</title>
            </head>
            <!--
              Table-based layout used throughout.
              display:flex / grid are NOT supported in Gmail, Outlook, or Apple Mail.
              All spacing is done with padding on <td> cells and spacer rows.
            -->
            <body style="margin:0;padding:0;background-color:#09090f;">
              <!-- Outer wrapper -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090f;">
                <tr>
                  <td align="center" style="padding:40px 16px 40px 16px;">

                    <!-- Email container -->
                    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

                      <!-- ── HEADER ── -->
                      <tr>
                        <td align="center" style="padding-bottom:32px;">
                          <p style="margin:0;font-family:Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:3px;color:#a78bfa;">KRYONIQ</p>
                          <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">AI Deepfake Detection Challenge</p>
                        </td>
                      </tr>

                      <!-- ── MAIN CARD ── -->
                      <tr>
                        <td style="background-color:#111118;border:1px solid #1f1f2e;border-radius:16px;padding:32px 28px 28px 28px;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">

                            <!-- Greeting -->
                            <tr>
                              <td style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#f9fafb;padding-bottom:6px;">
                                Hi ${userData.name},
                              </td>
                            </tr>
                            <tr>
                              <td style="font-family:Arial,sans-serif;font-size:14px;color:#9ca3af;padding-bottom:28px;line-height:1.5;">
                                Here are your results from the latest Kryoniq session.
                              </td>
                            </tr>

                            <!-- Score + Rank — side by side using table columns -->
                            <tr>
                              <td style="padding-bottom:12px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <!-- Score card -->
                                    <td width="48%" style="background-color:#1a1a2e;border:1px solid #2d2d44;border-radius:12px;padding:20px 16px;text-align:center;vertical-align:top;">
                                      <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;">Your Score</p>
                                      <p style="margin:0;font-family:Arial,sans-serif;font-size:40px;font-weight:800;color:#f9fafb;line-height:1;">
                                        ${score}<span style="font-size:18px;color:#6b7280;font-weight:400;">/10</span>
                                      </p>
                                    </td>
                                    <!-- Spacer column -->
                                    <td width="4%">&nbsp;</td>
                                    <!-- Rank card -->
                                    <td width="48%" style="background-color:#1a1a2e;border:1px solid #2d2d44;border-radius:12px;padding:20px 16px;text-align:center;vertical-align:top;">
                                      <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;">Your Rank</p>
                                      <p style="margin:0;font-family:Arial,sans-serif;font-size:40px;font-weight:800;color:#f9fafb;line-height:1;">
                                        #${leaderboardRank}
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>

                            <!-- Global High Score -->
                            <tr>
                              <td style="padding-bottom:4px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td style="background-color:#1a1a2e;border:1px solid #2d2d44;border-radius:12px;padding:20px 16px;text-align:center;">
                                      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;">&#127942; Global High Score</p>
                                      <p style="margin:0;font-family:Arial,sans-serif;font-size:32px;font-weight:800;color:#fbbf24;">${newHighScore}/10</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>

                          </table>
                        </td>
                      </tr>

                      <!-- Spacer -->
                      <tr><td height="28">&nbsp;</td></tr>

                      <!-- ── MOTIVATIONAL LINE ── -->
                      <tr>
                        <td align="center" style="font-family:Arial,sans-serif;font-size:14px;color:#6b7280;line-height:1.6;padding-bottom:32px;">
                          Keep sharpening your AI detection skills.<br/>
                          Every round makes you harder to fool.
                        </td>
                      </tr>

                      <!-- ── DIVIDER ── -->
                      <tr>
                        <td style="border-top:1px solid #1f1f2e;padding-top:24px;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="font-family:Arial,sans-serif;font-size:12px;color:#4b5563;">
                                Sent by Kryoniq &nbsp;&middot;&nbsp;
                                <a href="https://kryoniq.com" style="color:#6b7280;text-decoration:none;">kryoniq.com</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                    </table>
                    <!-- /Email container -->

                  </td>
                </tr>
              </table>
              <!-- /Outer wrapper -->
            </body>
            </html>
          `,
        });

        if (emailResponse.error) {
          logEmail("ERROR", "❌ Email sending failed", {
            error: emailResponse.error.message,
            statusCode: emailResponse.error.statusCode,
            errorName: emailResponse.error.name,
            recipient: userData.email,
          });
        } else if (emailResponse.data) {
          logEmail("SUCCESS", "✅ Email sent successfully!", {
            emailId: emailResponse.data.id,
            recipient: userData.email,
          });
        }
      } catch (emailError) {
        logEmail("ERROR", "❌ Email exception thrown", {
          error: emailError.message,
          errorName: emailError.name,
          statusCode: emailError.statusCode,
          recipient: userData.email,
        });
      }
    } else {
      logEmail("SKIP", "⚠️ Email not sent — no user email found", { userId });
    }

    res.json({ score, leaderboardRank, globalHighScore: newHighScore, totalGames: newTotalGames });
  } catch (error) {
    console.error("Submit Game Error:", error);
    res.status(500).json({ error: "Failed to submit game" });
  }
});

// ===================================================== 
// TEST EMAIL
// ===================================================== 
app.post("/api/test-email", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    logEmail("TEST", "🧪 Testing email functionality", {
      to: email,
      name: name || "Test User",
      from: EMAIL_CONFIG.from,
    });

    const emailResponse = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: "Test Email from Kryoniq",
      html: `
        <div style="font-family:\'Segoe UI\',Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0a0a0f;color:#f9fafb;border-radius:12px;">
          <h2 style="color:#a78bfa;">Kryoniq — Email Test</h2>
          <p>Hi ${name || "Test User"},</p>
          <p>This is a test email confirming that <strong>noreply@kryoniq.com</strong> is working correctly.</p>
          <hr style="border-color:#1f1f2e;margin:20px 0;">
          <small style="color:#6b7280;">Sent from: ${EMAIL_CONFIG.from}</small>
        </div>
      `,
    });

    if (emailResponse.error) {
      logEmail("TEST_ERROR", "❌ Test email failed", {
        error: emailResponse.error.message,
        statusCode: emailResponse.error.statusCode,
      });
      return res.status(500).json({
        success: false,
        error: emailResponse.error.message,
        statusCode: emailResponse.error.statusCode,
      });
    }

    if (emailResponse.data) {
      logEmail("TEST_SUCCESS", "✅ Test email sent!", { emailId: emailResponse.data.id });
      return res.json({ success: true, message: "Test email sent successfully", emailId: emailResponse.data.id });
    }
  } catch (error) {
    logEmail("TEST_ERROR", "❌ Test email exception", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================== 
// LEADERBOARD
// ===================================================== 
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("game_sessions")
      .select("score, created_at, app_users(name, organization)")
      .order("score", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Leaderboard Error:", error);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }

    const grouped = {};
    data.forEach((entry) => {
      const key = entry.app_users.name;
      if (!grouped[key]) {
        grouped[key] = {
          name: entry.app_users.name,
          organization: entry.app_users.organization,
          best_score: entry.score,
          latest_played: entry.created_at,
        };
      } else {
        if (entry.score > grouped[key].best_score) grouped[key].best_score = entry.score;
        if (entry.created_at > grouped[key].latest_played) grouped[key].latest_played = entry.created_at;
      }
    });

    const sorted = Object.values(grouped)
      .sort((a, b) => b.best_score - a.best_score)
      .slice(0, 10)
      .map((entry, index) => ({ rank: index + 1, ...entry }));

    res.json({ leaderboard: sorted });
  } catch (error) {
    console.error("Leaderboard Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================== 
// ADMIN ANALYTICS
// ============================== 
app.get("/api/admin/analytics", async (req, res) => {
  try {
    const { count: totalUsers } = await supabase
      .from("app_users").select("*", { count: "exact", head: true });

    const { count: totalGames } = await supabase
      .from("game_sessions").select("*", { count: "exact", head: true });

    const { data: sessions } = await supabase
      .from("game_sessions").select("score, session_duration, total_replays");

    let avgScore = 0, avgDuration = 0, avgReplays = 0;

    if (sessions?.length) {
      avgScore = (sessions.reduce((s, r) => s + r.score, 0) / sessions.length).toFixed(2);
      avgDuration = Math.round(sessions.reduce((s, r) => s + r.session_duration, 0) / sessions.length);
      avgReplays = (sessions.reduce((s, r) => s + r.total_replays, 0) / sessions.length).toFixed(2);
    }

    const { data: statsData } = await supabase
      .from("global_stats").select("high_score").eq("id", 1).single();

    const { data: orgData } = await supabase
      .from("game_sessions").select("user_id, app_users(organization)");

    const orgCount = {};
    orgData?.forEach((item) => {
      const org = item.app_users?.organization;
      if (!org) return;
      orgCount[org] = (orgCount[org] || 0) + 1;
    });

    const topOrganization = Object.entries(orgCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    res.json({
      totalUsers, totalGames,
      globalHighScore: statsData?.high_score || 0,
      averageScore: avgScore,
      averageSessionDurationSeconds: avgDuration,
      averageReplays: avgReplays,
      topOrganization,
    });
  } catch (error) {
    console.error("Admin Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ============================== 
// ADMIN DASHBOARD
// ============================== 
app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const { count: totalUsers } = await supabase
      .from("app_users").select("*", { count: "exact", head: true });

    const { count: totalGames } = await supabase
      .from("game_sessions").select("*", { count: "exact", head: true });

    const { data: statsData } = await supabase
      .from("global_stats").select("*").eq("id", 1).single();

    const { data: sessionData } = await supabase
      .from("game_sessions").select("score, session_duration, total_replays");

    let avgScore = 0, avgDuration = 0, avgReplays = 0;

    if (sessionData?.length) {
      avgScore = sessionData.reduce((s, r) => s + r.score, 0) / sessionData.length;
      avgDuration = sessionData.reduce((s, r) => s + (r.session_duration || 0), 0) / sessionData.length;
      avgReplays = sessionData.reduce((s, r) => s + (r.total_replays || 0), 0) / sessionData.length;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { count: gamesLast24Hours } = await supabase
      .from("game_sessions").select("*", { count: "exact", head: true })
      .gte("created_at", yesterday.toISOString());

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const { count: gamesLast7Days } = await supabase
      .from("game_sessions").select("*", { count: "exact", head: true })
      .gte("created_at", lastWeek.toISOString());

    const { data: mostActiveUserData } = await supabase
      .from("game_sessions").select("user_id").order("created_at", { ascending: false });

    let mostActiveUser = null;
    if (mostActiveUserData?.length) {
      const frequency = {};
      mostActiveUserData.forEach((g) => { frequency[g.user_id] = (frequency[g.user_id] || 0) + 1; });
      const topUserId = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
      const { data: user } = await supabase
        .from("app_users").select("name, organization").eq("id", topUserId).single();
      mostActiveUser = user;
    }

    const { data: orgData } = await supabase
      .from("game_sessions").select("score, app_users(organization)").order("score", { ascending: false });

    const bestPerformingOrganization = orgData?.[0]?.app_users?.organization || null;

    res.json({
      totalUsers, totalGames,
      globalHighScore: statsData?.high_score || 0,
      averageScore: avgScore.toFixed(2),
      averageSessionDurationSeconds: Math.round(avgDuration),
      averageReplays: avgReplays.toFixed(2),
      gamesLast24Hours, gamesLast7Days,
      mostActiveUser, bestPerformingOrganization,
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ============================== 
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  logEmail("SERVER", "🚀 Server started", {
    port: PORT,
    resendConfigured: !!process.env.RESEND_API_KEY,
    debugMode: EMAIL_DEBUG,
    emailFrom: EMAIL_CONFIG.from,
  });
});
