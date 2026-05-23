"use client";

import { useEffect } from "react";

export default function DashboardPage() {
  useEffect(() => {
    // Redirect ke dashboard eksternal
    // URL ini menunjuk ke dashboard eksternal yang dikonfigurasi oleh deployment.
    window.location.href = "http://localhost:1431/";
  }, []);

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-light-muted dark:text-dark-muted">Mengarahkan ke Dashboard...</p>
      </div>
    </div>
  );
}
