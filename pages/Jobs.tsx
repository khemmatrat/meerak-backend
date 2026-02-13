import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  Clock,
  DollarSign,
  Filter,
  X,
  List,
  Map,
} from "lucide-react";
import { MockApi } from "../services/mockApi";
import { Job } from "../types";
import { useLanguage } from "../context/LanguageContext";
import EmployerMap from "../components/EmployerMap";
export const Jobs: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Debounce search API call
    const timer = setTimeout(() => {
      loadJobs();
    }, 400);
    return () => clearTimeout(timer);
  }, [category, searchQuery]);

  const loadJobs = async () => {
  setLoading(true);
  try {
    const jobsFromApi = await MockApi.getJobs(category, searchQuery);
    
    // โหลด temp jobs จาก localStorage
    const tempJobs = JSON.parse(localStorage.getItem('temp_jobs') || '[]');
    
    // รวม jobs ทั้งหมด
    const allJobs = [...jobsFromApi, ...tempJobs];
    
    // Filter ตาม category และ search
    const filteredJobs = allJobs.filter(job => {
      const categoryMatch = category === 'All' || job.category === category;
      const searchMatch = 
        !searchQuery || 
        job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return categoryMatch && searchMatch;
    });
    
    setJobs(filteredJobs);
  } catch (error) {
    console.error('Error loading jobs:', error);
  } finally {
    setLoading(false);
  }
};

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (value.length > 1) {
      try {
        const results = await MockApi.getSearchSuggestions(value);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (err) {
        console.error(err);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (term: string) => {
    setSearchQuery(term);
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const categories = [
    "All",
    // Home Services
    "Cleaning",
    "AC_Cleaning",
    "Plumbing",
    "Electrician",
    "Moving",
    "Gardening",
    "Painting",
    "Pest_Control",
    "Appliance_Repair",
    "Interior_Design",
    // Lifestyle
    "Dating",
    "Shopping_Buddy",
    "Party_Guest",
    "Model",
    "Consultant",
    "Fortune_Telling",
    "Queue_Service",
    "Private_Chef",
    // Health
    "Beauty",
    "Massage",
    "Physiotherapy",
    "Personal_Trainer",
    "Pet_Care",
    "Caregiving",
    // Tech & Biz
    "IT_Support",
    "Web_Dev",
    "Graphic_Design",
    "Photography",
    "Videography",
    "Translation",
    "Accounting",
    "Legal",
    // Logistics
    "Driver",
    "Messenger",
    "Tutoring",
    "General",
  ];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("jobs.title")}
          </h1>

          {/* View Toggle */}
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex items-center shadow-sm">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md flex items-center text-sm font-medium transition-all ${viewMode === "list" ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <List size={18} className="mr-1.5" /> {t("jobs.view_list")}
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1"></div>
            <button
              onClick={() => setViewMode("map")}
              className={`p-2 rounded-md flex items-center text-sm font-medium transition-all ${viewMode === "map" ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Map size={18} className="mr-1.5" /> {t("jobs.view_map")}
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-2 w-full no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                category === cat
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t(`cat.${cat}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative z-20" ref={searchRef}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length > 1 && setShowSuggestions(true)}
            className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm transition-all"
            placeholder={t("jobs.search")}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95">
            <ul>
              {suggestions.map((suggestion, index) => (
                <li key={index}>
                  <button
                    onClick={() => selectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center"
                  >
                    <Search size={14} className="mr-2 opacity-50" />
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 bg-gray-200 rounded-xl animate-pulse"
            ></div>
          ))}
        </div>
      ) : (
        <>
          {viewMode === "list" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <Link
                  to={`/jobs/${job.id}`}
                  key={job.id}
                  className="group block"
                >
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow p-6 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {t(`cat.${job.category}`) || job.category}
                      </span>
                      <span className="text-sm text-gray-500 flex items-center">
                        <Clock size={14} className="mr-1" />
                        {new Date(job.datetime).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
                      {job.title}
                    </h3>
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1">
                      {job.description}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex items-center text-gray-600 text-sm">
                        <MapPin size={16} className="mr-1" />
                        <span>
                          {" "}
                          {job.location
                            ? `${job.location.lat.toFixed(2)}, ${job.location.lng.toFixed(2)}`
                            : t("jobs.location_not_specified")}
                        </span>
                      </div>
                      <div className="flex items-center font-bold text-emerald-600">
                        <DollarSign size={18} />
                        <span>
                          {job.price}{" "}
                          <span className="text-xs font-normal text-gray-500">
                            {t("detail.thb")}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {jobs.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100">
                    <Filter className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {t("jobs.no_jobs")}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t("jobs.try_filter")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmployerMap
              jobs={jobs}
              height="500px"
              showControls={true}
              initialZoom={12}
              onJobSelect={(job) => {
                // เมื่อคลิก job บนแผนที่
                navigate(`/jobs/${job.id}`);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
