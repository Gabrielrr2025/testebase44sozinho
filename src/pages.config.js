import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import Products from './pages/Products';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Calendar from './pages/Calendar';
import Admin from './pages/Admin';
import Production from './pages/Production';

export const PAGES = {
  "Dashboard": Dashboard,
  "Planning": Planning,
  "Products": Products,
  "Reports": Reports,
  "Settings": Settings,
  "Calendar": Calendar,
  "Admin": Admin,
  "Production": Production,
}

export const pagesConfig = {
  mainPage: "Products",
  Pages: PAGES,
};