import React from "react";
import { Capacitor } from "@capacitor/core";

type Props = {
  message: string;
  iosStoreUrl?: string;
  playStoreUrl?: string;
};

export const ForceUpdateScreen: React.FC<Props> = ({ message, iosStoreUrl, playStoreUrl }) => {
  const platform = Capacitor.getPlatform();
  const url =
    platform === "ios"
      ? iosStoreUrl?.trim() || ""
      : platform === "android"
        ? playStoreUrl?.trim() || ""
        : "";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-xl font-bold">ต้องอัปเดตแอป</h1>
        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 font-semibold text-white w-full"
          >
            ไปที่ Store
          </a>
        ) : (
          <p className="text-xs text-slate-500">ตั้งค่า App Store / Play Store URL ใน Admin → Mobile Remote Config</p>
        )}
      </div>
    </div>
  );
};
