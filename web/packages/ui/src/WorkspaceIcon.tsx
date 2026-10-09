import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import GppMaybeOutlined from '@mui/icons-material/GppMaybeOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import PolicyOutlined from '@mui/icons-material/PolicyOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutlined';
const icons = {
  '/': DashboardOutlined,
  '/my-work': AssignmentOutlined,
  '/trust-safety': ShieldOutlined,
  '/restricted-safety': GppMaybeOutlined,
  '/community-ideas': LightbulbOutlined,
  '/businesses': BusinessOutlined,
  '/business-privacy': PolicyOutlined,
  '/sponsored-dojis': CampaignOutlined,
  '/announcements': CampaignOutlined,
  '/operations': MonitorHeartOutlined,
  '/audit': HistoryOutlined,
  '/team': PeopleOutline,
};
export function WorkspaceIcon({ path }: { path: string }) {
  const Icon = icons[path as keyof typeof icons] ?? AssignmentOutlined;
  return <Icon fontSize="small" />;
}
