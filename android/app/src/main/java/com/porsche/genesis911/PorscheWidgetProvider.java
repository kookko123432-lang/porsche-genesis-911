package com.porsche.genesis911;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.TimeZone;

public class PorscheWidgetProvider extends AppWidgetProvider {

    private static final String[] AFFIRMATIONS = new String[]{
        "「我不出售廉價時間，我只打造配得上 911 的高槓桿系統。」",
        "「我就是 2029 年 4 月 18 日保時捷 911 的準車主。」",
        "「當左手轉動保時捷點火旋鈕時，我感受到絕對的平靜與掌控權。」",
        "「這 911 天的每一個決策，都在將我的座駕推向交車室聚光燈下。」"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // 計算距離 2026-10-21 (Day 1) 至 2029-04-18 (Day 911) 的真實天數
        Calendar startCal = Calendar.getInstance(TimeZone.getDefault());
        startCal.set(2026, Calendar.OCTOBER, 21, 0, 0, 0);

        long nowMs = System.currentTimeMillis();
        long diffDays = (nowMs - startCal.getTimeInMillis()) / (1000L * 60 * 60 * 24) + 1;
        long dayNum = Math.max(1, Math.min(911, diffDays));
        long daysLeft = Math.max(0, 911 - dayNum);

        int affirmIndex = (int) (Math.abs(nowMs / (1000L * 60 * 60 * 6)) % AFFIRMATIONS.length);
        String affirm = AFFIRMATIONS[affirmIndex];

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.porsche_widget);
            views.setTextViewText(R.id.widget_day_badge, String.format("DAY %03d / 911", dayNum));
            views.setTextViewText(R.id.widget_tminus, String.format("T-%d DAYS", daysLeft));
            views.setTextViewText(R.id.widget_affirmation, affirm);

            Intent intent = new Intent(context, MainActivity.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, flags);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
