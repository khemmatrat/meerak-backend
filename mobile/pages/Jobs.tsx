import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  MapPin,
  Clock,
  DollarSign,
  Filter,
  X,
  List,
  Map,
  LayoutGrid,
} from "lucide-react";
import { MockApi } from "../services/mockApi";
import { Job } from "../types";
import { formatJobPrimaryAddress } from "../utils/jobLocationDisplay";
import { useLanguage } from "../context/LanguageContext";
import EmployerMap from "../components/EmployerMap";
import {
  JOB_CATEGORY_GROUPS,
  JOB_CATEGORY_ICON,
  GROUP_ACCENT,
  type JobCategoryGroupId,
} from "../lib/jobCategoryHub";
import { PreLaunchServiceBlock } from "../components/PreLaunchServiceBlock";

export const Jobs: React.FC = () => {
  const [searchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category") || "All";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(categoryFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const categories = [
    "All",
    ...JOB_CATEGORY_GROUPS.flatMap((g) => g.categories),
  ];

  const selectCategory = useCallback(
    (cat: string) => {
      setCategory(cat);
      if (cat === "All") {
        navigate("/jobs", { replace: true });
      } else {
        navigate(`/jobs?category=${encodeURIComponent(cat)}`, { replace: true });
      }
    },
    [navigate]
  );

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
    const urlCat = searchParams.get("category") || "All";
    setCategory(urlCat);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadJobs();
    }, 400);
    return () => clearTimeout(timer);
  }, [category, searchQuery]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const jobsFromApi = await MockApi.getJobs(category, searchQuery);

      const tempJobs = JSON.parse(localStorage.getItem("temp_jobs") || "[]");

      const allJobs = [...jobsFromApi, ...tempJobs];

      const filteredJobs = allJobs.filter((job) => {
        const categoryMatch = category === "All" || job.category === category;
        const searchMatch =
          !searchQuery ||
          job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.description?.toLowerCase().includes(searchQuery.toLowerCase());

        return categoryMatch && searchMatch;
      });

      setJobs(filteredJobs);
    } catch (error) {
      console.error("Error loading jobs:", error);
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

  const scrollToHub = () => {
    hubRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const popularPick = (cat: string) => {
    selectCategory(cat);
    hubRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <PreLaunchServiceBlock title="หางาน / จ้างงาน" />
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("jobs.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("jobs.category_hub_sub")}</p>
          </div>

          <div className="bg-white p-1 rounded-lg border border-gray-200 flex items-center shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md flex items-center text-sm font-medium transition-all ${viewMode === "list" ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <List size={18} className="mr-1.5" /> {t("jobs.view_list")}
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`p-2 rounded-md flex items-center text-sm font-medium transition-all ${viewMode === "map" ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Map size={18} className="mr-1.5" /> {t("jobs.view_map")}
            </button>
          </div>
        </div>

        {/* Visual category hub — grouped grid so professions never “disappear” in one thin strip */}
        <div
          ref={hubRef}
          id="job-category-hub"
          className="rounded-2xl border border-emerald-100/90 bg-gradient-to-b from-white via-emerald-50/30 to-white p-4 sm:p-5 shadow-[0_8px_30px_rgba(16,185,129,0.08)]"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700/90">
                AQOND
              </p>
              <h2 className="text-lg font-bold text-gray-900">{t("jobs.category_hub_title")}</h2>
            </div>
            <button
              type="button"
              onClick={() => selectCategory("All")}
              className={`inline-flex items-center justify-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-semibold border-2 transition-all ${
                category === "All"
                  ? "border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-900/10"
                  : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
              }`}
            >
              <LayoutGrid size={18} />
              {t(`cat.All`)}
            </button>
          </div>

          <div className="space-y-6">
            {JOB_CATEGORY_GROUPS.map((group) => {
              const accent = GROUP_ACCENT[group.id as JobCategoryGroupId];
              const labelKey = `jobs.group_${group.id}` as const;
              return (
                <div key={group.id}>
                  <div
                    className={`mb-3 h-1 rounded-full bg-gradient-to-r ${accent.bar} opacity-90`}
                    aria-hidden
                  />
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {t(labelKey)}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {group.categories.map((cat) => {
                      const Icon = JOB_CATEGORY_ICON[cat] || LayoutGrid;
                      const active = category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => selectCategory(cat)}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-all min-h-[4.25rem] ${accent.tile} ${
                            active
                              ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white shadow-md scale-[1.02]"
                              : "shadow-sm"
                          }`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.iconWrap}`}
                          >
                            <Icon size={20} strokeWidth={2} />
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-gray-900 line-clamp-2">
                            {t(`cat.${cat}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact quick strip for repeat filtering without scrolling the grid */}
          <div className="mt-5 pt-4 border-t border-emerald-100/80">
            <p className="text-[11px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              {t("jobs.quick_strip")}
            </p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => selectCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
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
        </div>
      </div>

      {category !== "All" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm">
          <p className="text-gray-800">
            <span className="font-medium text-gray-600">{t("jobs.showing")}: </span>
            <span className="font-bold text-emerald-800">{t(`cat.${category}`)}</span>
          </p>
          <button
            type="button"
            onClick={() => selectCategory("All")}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
          >
            {t("jobs.clear_filter")}
          </button>
        </div>
      )}

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
              type="button"
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95">
            <ul>
              {suggestions.map((suggestion, index) => (
                <li key={index}>
                  <button
                    type="button"
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
            <div key={i} className="h-48 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {viewMode === "list" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <Link to={`/jobs/${job.id}`} key={job.id} className="group block">
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
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1">{job.description}</p>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex items-start text-gray-600 text-sm min-w-0 pr-2">
                        <MapPin size={16} className="mr-1 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 break-words">
                          {job.location
                            ? formatJobPrimaryAddress(job) || t("jobs.location_not_specified")
                            : t("jobs.location_not_specified")}
                        </span>
                      </div>
                      <div className="flex items-center font-bold text-emerald-600">
                        <DollarSign size={18} />
                        <span>
                          {job.price}{" "}
                          <span className="text-xs font-normal text-gray-500">{t("detail.thb")}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {jobs.length === 0 && (
                <div className="col-span-full">
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-gradient-to-b from-emerald-50/50 to-white px-5 py-10 text-center">
                    <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-white border border-emerald-100 shadow-sm mb-4">
                      <Filter className="h-7 w-7 text-emerald-500" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">{t("jobs.empty_explore")}</h3>
                    <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">{t("jobs.empty_explore_sub")}</p>
                    <p className="mt-1 text-sm text-gray-500">{t("jobs.try_filter")}</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {["Cleaning", "Driver", "Beauty", "IT_Support"].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => popularPick(cat)}
                          className="rounded-full bg-emerald-600 text-white text-xs font-semibold px-4 py-2 shadow-sm hover:bg-emerald-700 transition-colors"
                        >
                          {t(`cat.${cat}`)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={scrollToHub}
                      className="mt-5 text-sm font-semibold text-emerald-700 hover:underline"
                    >
                      ↑ {t("jobs.category_hub_title")}
                    </button>
                  </div>
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
                navigate(`/jobs/${job.id}`);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
