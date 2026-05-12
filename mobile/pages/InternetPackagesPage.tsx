import React from "react";
import { HomeInternetPackagesSection } from "../components/HomeInternetPackagesSection";

/**
 * ร้าน eSIM — พื้นขาว/เทาอ่อน อ่านง่าย
 */
export const InternetPackagesPage: React.FC = () => {
  return (
    <div className="relative -mx-4 min-h-[70vh] bg-white px-4 pb-28 sm:mx-0 sm:bg-white sm:px-0">
      <div className="relative pb-4">
        <HomeInternetPackagesSection />
      </div>
    </div>
  );
};

export default InternetPackagesPage;
