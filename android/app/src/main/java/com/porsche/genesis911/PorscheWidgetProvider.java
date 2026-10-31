package com.porsche.genesis911;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.TimeZone;

public class PorscheWidgetProvider extends AppWidgetProvider {

    private static final int TOTAL_DAYS = 911;

    private static final String[] AFFIRMATIONS = new String[]{
        "「我不出售廉價時間，我只打造配得上 911 的高槓桿系統。」",
        "「我就是 2029 年 4 月 18 日保時捷 911 的準車主。」",
        "「當左手轉動點火旋鈕時，我感受到絕對的平靜與掌控權。」",
        "「這 911 天的每一個決策，都在把我的座駕推向交車室。」"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    /** Called from MainActivity.onResume so the count is fresh whenever the app is opened. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PorscheWidgetProvider.class));
        if (ids != null && ids.length > 0) render(context, manager, ids);
    }

    // Calendar-day index (DST-safe): 2026-10-21 = Day 1
    private static int dayNumber() {
        Calendar now = Calendar.getInstance();
        GregorianCalendar today = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        today.clear();
        today.set(now.get(Calendar.YEAR), now.get(Calendar.MONTH), now.get(Calendar.DAY_OF_MONTH));
        GregorianCalendar start = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        start.clear();
        start.set(2026, Calendar.OCTOBER, 21);
        long diff = Math.round((today.getTimeInMillis() - start.getTimeInMillis()) / 86400000.0) + 1;
        return (int) Math.max(1, Math.min(TOTAL_DAYS, diff));
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        int day = dayNumber();
        int left = Math.max(0, TOTAL_DAYS - day);
        int affirmIndex = (int) ((System.currentTimeMillis() / (6L * 3600 * 1000)) % AFFIRMATIONS.length);

        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.porsche_widget);
            v.setTextViewText(R.id.widget_day_badge, String.format("DAY %03d / 911", day));
            v.setTextViewText(R.id.widget_tminus, String.valueOf(left));
            v.setTextViewText(R.id.widget_affirmation, AFFIRMATIONS[affirmIndex]);
            v.setProgressBar(R.id.widget_progress, TOTAL_DAYS, day, false);
            v.setOnClickPendingIntent(R.id.widget_root, open);
            manager.updateAppWidget(id, v);
        }
    }
}
