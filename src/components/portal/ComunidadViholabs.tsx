"use client";

import CommunityHeaderModule from "@/components/portal/community/CommunityHeaderModule";
import IdentityBlock from "@/components/portal/community/IdentityBlock";
import PerformanceAdminBlock from "@/components/portal/community/PerformanceAdminBlock";

export default function ComunidadViholabs() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <CommunityHeaderModule />
      <IdentityBlock />
      <PerformanceAdminBlock />
    </div>
  );
}