# What Do You Want For Dinner?

A production-ready recipe management and meal planning web application built with React, Vite, and Supabase.

## 🎯 Features

- **Recipe Library**: Save and organize all your favorite recipes
- **Weekly Meal Planner**: Randomly suggest meals for the week with easy swapping
- **Shopping List Generator**: Automatically create grocery lists from your meal plan
- **TDEE Calculator**: Calculate your daily calorie needs and macro goals
- **Macro Tracking**: Track nutrition information for all your recipes
- **Responsive Design**: Beautiful, mobile-first design that works on all devices

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form
- **Icons**: Lucide React
- **Backend**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel (frontend) + Supabase (backend)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd whatdoyouwantfordinner
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your_supabase_project_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. Set up the database:
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Run the migration file: `supabase/migrations/001_initial_schema.sql`

5. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components
│   ├── layout/          # Layout components (Navbar, etc.)
│   ├── recipes/         # Recipe-related components
│   ├── planner/         # Meal planner components
│   ├── shopping/        # Shopping list components
│   └── tdee/            # TDEE calculator components
├── pages/               # Page components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions and Supabase client
├── context/             # React context providers
└── App.jsx              # Main app component with routing
```

## 🎨 Design System

The app uses a warm, cozy design inspired by a well-loved recipe card box:

- **Primary Color**: Burnt Orange (#C8622A)
- **Secondary Color**: Sage Green (#5C7A4A)
- **Accent Color**: Golden Yellow (#E8A838)
- **Typography**: Playfair Display (headings) + Lato (body)

## 📝 Database Schema

The app uses the following main tables:

- `profiles`: User profile information and macro goals
- `recipes`: Recipe details, ingredients, and nutrition info
- `meal_plans`: Weekly meal plans
- `meal_plan_entries`: Individual meals in a plan
- `shopping_lists`: Generated shopping lists

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

## 🔐 Authentication

The app uses Supabase Auth with email/password authentication. Users are automatically redirected to the dashboard after signing in.

## 🚢 Deployment

### Frontend (Vercel)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your environment variables in Vercel's dashboard
4. Deploy!

### Backend (Supabase)

Your Supabase project is already hosted. Just make sure to:
1. Run the migration file in your Supabase SQL editor
2. Configure authentication settings in Supabase dashboard
3. Set up any additional security rules as needed

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 💬 Support

For support, please open an issue in the GitHub repository.

---

Made with ❤️ for home cooks everywhere
