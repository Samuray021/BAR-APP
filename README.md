# BAR APP — новая версия

Новая архитектура приложения для внутренних процессов бара.

## Стек
- React + TypeScript + Vite
- Supabase Auth, Postgres, Storage
- PWA для установки на iPhone и Android

## Локальный запуск
```bash
npm install
npm run dev
```

## Переменные окружения
По умолчанию используются публичные URL и publishable key проекта BAR APP. Для отдельного окружения создайте `.env.local`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Никогда не добавляйте service_role или secret key во frontend.

## Текущий этап
- Авторизация по логину и паролю через Supabase Auth.
- Привязка аккаунта к активной записи сотрудника.
- Просмотр 57 существующих техкарт.
- Поиск и фильтрация рецептов.
- Создание, редактирование и удаление техкарт для управляющего (ограничивается RLS).
- Адаптивная оболочка с мобильной навигацией.

Следующие этапы: заготовки, списания, открытие смены с фотографиями, управление сотрудниками, уведомления.


Build checks are executed by GitHub Actions on every push to `rebuild-v1`.
