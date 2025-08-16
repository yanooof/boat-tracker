# Boat Tracker

A **real-time boat tracking app** for the Maldives, built with **Laravel**, **Leaflet.js**, and **Python**.  
Inspired by [followme.mv](https://followme.mv/public), this project improves the experience with a cleaner interface, search, filters, and map customization.

## 🚀 Features

-   Live boat data refresh every **30 seconds**
-   Interactive **map view** with color-coded markers
-   Distinction between **moving and stationary** boats
-   **Hover & click** for boat details (name, speed, last update)
-   **Search** boats by name
-   **Filters**: type, atoll, location, favorites
-   **List view** of all boats (collaborator contribution)
-   **Map style switcher** (multiple layers)
-   **User accounts** via Laravel Breeze (save favorites & map style)
-   **Status bar** showing boat count + last refresh

## 🛠️ Tech Stack

-   **Backend**: Laravel 11
-   **Frontend**: Blade, Leaflet.js
-   **Database**: SQLite
-   **Auth**: Laravel Breeze
-   **Data Fetch**: Python scraper

## ⚙️ Quick Setup

```bash
git clone https://github.com/yanooof/boat-tracker.git
cd boat-tracker
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
npm run dev-all

##npm run dev-all runs php artisan serve and npm run dev simultaneously

```
