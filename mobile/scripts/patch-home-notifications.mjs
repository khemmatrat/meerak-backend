import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "pages", "Home.tsx");

let s = fs.readFileSync(p, "utf8");

s = s.replace(
  `import { Link } from "react-router-dom";`,
  `import { Link, useNavigate } from "react-router-dom";`,
);

s = s.replace(
  `import { BackendBannersSection } from "../components/BackendBannersSection";`,
  `import { BackendBannersSection } from "../components/BackendBannersSection";
import { getNotificationJobNavigatePath } from "../utils/notificationDeepLink";`,
);

s = s.replace(
  `export interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  target: string;
  sentAt: string;
}`,
  `export interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  target?: string;
  sentAt: string;
  source?: string;
  jobId?: string | null;
  notificationType?: string;
  data?: Record<string, unknown> | null;
}`,
);

const OLD_HOME = `export const Home: React.FC = () => {
  const { user } = useAuth();`;

const NEW_HOME = `export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();`;

if (!s.includes(OLD_HOME)) {
  console.error("patch-home: could not find Home component start");
  process.exit(1);
}
s = s.replace(OLD_HOME, NEW_HOME);

const OLD_CARD = `      {!notifLoading && latestAdminNotif && (
        <div className="luxury-card home-admin-notif-card p-4 flex items-start gap-3">
          <div className="home-admin-notif-bell bg-indigo-600 p-2.5 rounded-2xl shrink-0 shadow-md">
            <Bell size={22} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="home-admin-notif-title font-semibold text-slate-100">{latestAdminNotif.title}</p>
            <p className="home-admin-notif-message text-slate-300 text-sm mt-0.5 leading-relaxed">{latestAdminNotif.message}</p>
            <p className="home-admin-notif-time text-slate-400 text-xs mt-1">
              {latestAdminNotif.sentAt
                ? new Date(latestAdminNotif.sentAt).toLocaleString("th-TH")
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissAdminNotif(latestAdminNotif.id)}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-white/15 hover:text-white transition-colors shrink-0"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
      )}`;

const NEW_CARD = `      {!notifLoading && latestAdminNotif && (() => {
        const notificationPath = getNotificationJobNavigatePath({
          source: latestAdminNotif.source,
          jobId: latestAdminNotif.jobId ?? null,
          notificationType: latestAdminNotif.notificationType,
          data: latestAdminNotif.data ?? null,
        });
        return (
        <div
          role={notificationPath ? "button" : undefined}
          tabIndex={notificationPath ? 0 : undefined}
          onClick={() => {
            if (notificationPath) navigate(notificationPath);
          }}
          onKeyDown={(e) => {
            if (notificationPath && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              navigate(notificationPath);
            }
          }}
          className={
            "luxury-card home-admin-notif-card p-4 flex items-start gap-3 " +
            (notificationPath
              ? "cursor-pointer hover:border-violet-500/35 transition-colors"
              : "")
          }
        >
          <div className="home-admin-notif-bell bg-indigo-600 p-2.5 rounded-2xl shrink-0 shadow-md">
            <Bell size={22} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="home-admin-notif-title font-semibold text-slate-100">{latestAdminNotif.title}</p>
            <p className="home-admin-notif-message text-slate-300 text-sm mt-0.5 leading-relaxed">{latestAdminNotif.message}</p>
            <p className="home-admin-notif-time text-slate-400 text-xs mt-1">
              {latestAdminNotif.sentAt
                ? new Date(latestAdminNotif.sentAt).toLocaleString("th-TH")
                : ""}
            </p>
            {notificationPath ? (
              <p className="text-[11px] text-violet-300/90 mt-1.5">แตะเพื่อเปิดงานที่เกี่ยวข้อง</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              dismissAdminNotif(latestAdminNotif.id);
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-white/15 hover:text-white transition-colors shrink-0"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
        );
      })()}`;

if (!s.includes(OLD_CARD)) {
  console.error("patch-home: admin notification card block not found");
  process.exit(1);
}
s = s.replace(OLD_CARD, NEW_CARD);

const outNext = `${p}.next`;
try {
  fs.writeFileSync(p, s);
  console.log("Home.tsx patched OK");
} catch (e) {
  if (e && e.code === "EPERM") {
    fs.writeFileSync(outNext, s);
    console.warn(
      "Could not overwrite Home.tsx (file locked). Wrote:",
      outNext,
      "- close Home.tsx in the IDE and replace manually.",
    );
  } else throw e;
}
