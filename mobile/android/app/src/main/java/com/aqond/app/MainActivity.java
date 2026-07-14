package com.aqond.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * ต้องตรงกับ backend (fcmPushDefaults.js) และ FCM payload android.notification.channel_id
     */
    public static final String CHANNEL_INTERCITY_JOBS = "aqond_intercity_jobs";

    /** ข่าวจากแอดมิน (Push tab) — ตรงกับ backend AQOND_FCM_CHANNEL_APP_NEWS */
    public static final String CHANNEL_APP_NEWS = "aqond_app_news";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createIntercityNotificationChannel();
        createAppNewsNotificationChannel();
    }

    private void createIntercityNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        Uri soundUri = Uri.parse(
                ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/aqond_notification");

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_INTERCITY_JOBS,
                "งาน Intercity และงานใหม่",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("แจ้งเตือนเมื่อมีคนขับเสนอราคาหรืองานใหม่");
        channel.setSound(soundUri, audioAttributes);
        channel.enableVibration(true);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.createNotificationChannel(channel);
        }
    }

    private void createAppNewsNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        Uri soundUri = Uri.parse(
                ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/aqond_notification");

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_APP_NEWS,
                "ข่าวและประกาศจากแอดมิน",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("ประกาศโปรโมชันและข่าวสารจากทีมงาน Aqond");
        channel.setSound(soundUri, audioAttributes);
        channel.enableVibration(true);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.createNotificationChannel(channel);
        }
    }
}
