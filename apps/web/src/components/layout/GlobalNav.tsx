import { Box, ShieldCheck, Database, Activity, LayoutGrid } from 'lucide-react';

interface GlobalNavProps {
  onHome?: () => void;
}

export function GlobalNav({ onHome }: GlobalNavProps) {
  return (
    <aside className="w-14 border-r border-border flex flex-col items-center py-4 gap-4 bg-[#0c0c0e]">
      <div 
        onClick={onHome}
        className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-white mb-2 shadow-lg shadow-accent/5 cursor-pointer hover:bg-zinc-700 transition-all"
      >
        <Box size={20} className="text-accent" />
      </div>
      <nav className="flex flex-col gap-4 mt-2">
        <NavIcon icon={<LayoutGrid size={18} />} label="Inbox" onClick={onHome} />
        <NavIcon icon={<ShieldCheck size={18} />} label="Security" />
        <NavIcon icon={<Database size={18} />} label="Storage" />
        <NavIcon icon={<Activity size={18} />} label="Monitoring" />
      </nav>
    </aside>
  );
}

function NavIcon({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors" 
      title={label}
    >
      {icon}
    </div>
  );
}
