import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import {
  Satellite,
  Navigation,
  Info,
  Clock,
  Globe,
  RefreshCw,
  Moon,
  Sun,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "leaflet/dist/leaflet.css";
import Chatbot from "./Chatbot";

const issIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3256/3256114.png",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20],
  className: "iss-marker",
});

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.panTo(position, { animate: true, duration: 1.2 });
    }
  }, [position, map]);
  return null;
}

const calculateSpeed = (pos1, pos2, timeDiffSeconds) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(pos2.lat - pos1.lat);
  const dLon = toRad(pos2.lng - pos1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pos1.lat)) *
      Math.cos(toRad(pos2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return (distance / timeDiffSeconds) * 3600;
};

const reverseGeocode = async (lat, lng) => {
  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "jsonv2",
          lat,
          lon: lng,
          zoom: 10,
          addressdetails: 1,
        },
      },
    );
    const address = response.data?.address || {};
    return (
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.county ||
      address.state ||
      address.region ||
      address.country ||
      response.data?.display_name ||
      "Unknown location"
    );
  } catch {
    return "Unknown location";
  }
};

const NewsSkeleton = () => (
  <div className="grid gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 shadow-sm sm:grid-cols-[140px_minmax(0,_1fr)] animate-pulse">
    <div className="h-36 w-full rounded-3xl bg-slate-100 dark:bg-slate-800 sm:h-full sm:w-[140px]" />
    <div className="flex flex-col justify-between gap-3">
      <div className="space-y-3">
        <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-5 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="flex justify-between items-center">
        <div className="h-3 w-1/4 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-8 w-24 rounded-full bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  </div>
);

const ISSTracker = ({ isDarkMode, toggleTheme }) => {
  const [position, setPosition] = useState([0, 0]);
  const [history, setHistory] = useState([]);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timestamp, setTimestamp] = useState("00:00:00");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [nearestPlace, setNearestPlace] = useState("Loading...");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [newsData, setNewsData] = useState({
    space: [],
    science: [],
  });
  const [newsLoading, setNewsLoading] = useState({
    space: false,
    science: false,
  });
  const [newsError, setNewsError] = useState({
    space: null,
    science: null,
  });
  const intervalRef = useRef(null);
  const previousPositionRef = useRef(null);
  const NEWS_CACHE_KEY = "iss-news-cache";
  const NEWS_CACHE_TTL = 15 * 60 * 1000;
  const newsCategories = [
    { key: "space", title: "Space News", query: "space" },
    { key: "science", title: "Science Updates", query: "science" },
  ];

  const getCachedNews = () => {
    try {
      const cached = window.localStorage.getItem(NEWS_CACHE_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.fetchedAt > NEWS_CACHE_TTL) return null;
      return parsed.data || null;
    } catch {
      return null;
    }
  };

  const setCachedNews = (data) => {
    try {
      window.localStorage.setItem(
        NEWS_CACHE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), data }),
      );
    } catch {
      // ignore localStorage write errors
    }
  };

  const sortArticles = (articles) => {
    return [...articles].sort((a, b) => {
      if (sortKey === "source") {
        return a.source.localeCompare(b.source);
      }
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  };

  const filterArticles = (articles) => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) return articles;
    return articles.filter((article) => {
      const title = article.title?.toLowerCase() || "";
      const summary = article.summary?.toLowerCase() || "";
      const source = article.source?.toLowerCase() || "";
      const author = article.author?.toLowerCase() || "";
      return (
        title.includes(search) ||
        summary.includes(search) ||
        source.includes(search) ||
        author.includes(search)
      );
    });
  };

  const fetchNewsCategory = async (category, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedNews();
      if (cached && cached[category.key]?.length) {
        setNewsData((prev) => ({
          ...prev,
          [category.key]: cached[category.key],
        }));
      }
    }

    setNewsLoading((prev) => ({ ...prev, [category.key]: true }));
    setNewsError((prev) => ({ ...prev, [category.key]: null }));

    try {
      const response = await axios.get(
        `https://api.spaceflightnewsapi.net/v4/articles?limit=5&search=${category.query}&sort=published_at:desc`,
      );
      const results = response.data?.results || [];
      const articles = results.map((item) => ({
        id: item.id,
        title: item.title,
        source: category.title,
        author:
          Array.isArray(item.authors) && item.authors.length > 0
            ? item.authors.join(", ")
            : item.news_site || "Unknown",
        publishedAt:
          item.published_at || item.updated_at || new Date().toISOString(),
        imageUrl:
          item.image_url ||
          item.imageUrl ||
          "https://via.placeholder.com/400x240?text=No+Image",
        summary: item.summary || item.title,
        url: item.url,
      }));
      setNewsData((prev) => {
        const updated = { ...prev, [category.key]: articles };
        setCachedNews({ ...updated });
        return updated;
      });
      if (forceRefresh) toast.success(`${category.title} updated`);
    } catch (err) {
      console.error("News fetch error", err);
      setNewsError((prev) => ({
        ...prev,
        [category.key]: "Unable to load articles. Please try again.",
      }));
      toast.error(`Failed to load ${category.title.toLowerCase()}`);
    } finally {
      setNewsLoading((prev) => ({ ...prev, [category.key]: false }));
    }
  };

  const refreshCategory = async (categoryKey) => {
    const category = newsCategories.find((item) => item.key === categoryKey);
    if (category) {
      await fetchNewsCategory(category, true);
    }
  };

  useEffect(() => {
    const cached = getCachedNews();
    if (cached) {
      setNewsData(cached);
    }
    newsCategories.forEach((category) => fetchNewsCategory(category, false));
  }, []);

  const allNewsArticles = sortArticles(
    filterArticles([...newsData.space, ...newsData.science]),
  );

  const fetchISSLocation = async () => {
    try {
      let data;
      try {
        const response = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!response.ok) throw new Error("Primary API failed");
        data = await response.json();
      } catch (e) {
        const response = await fetch("https://api.open-notify.org/iss-now.json");
        const json = await response.json();
        data = {
          latitude: json.iss_position.latitude,
          longitude: json.iss_position.longitude,
          timestamp: json.timestamp,
        };
      }

      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      const timestampSec = Number(data.timestamp) || Math.floor(Date.now() / 1000);
      
      if (isNaN(lat) || isNaN(lng)) throw new Error("Invalid coordinates");

      const newPos = { lat, lng, timestamp: timestampSec };
      const prevPos = previousPositionRef.current;
      const timeDiff = prevPos ? Math.max(timestampSec - prevPos.timestamp, 1) : 0;
      const currentSpeed = prevPos ? Math.round(calculateSpeed(prevPos, newPos, timeDiff)) : 0;
      
      const timeLabel = new Date(timestampSec * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setPosition([lat, lng]);
      setTimestamp(timeLabel);
      setSpeed(currentSpeed);
      setHistory((prev) => [...prev, newPos].slice(-15));
      setTrend((prev) => [...prev, { time: timeLabel, speed: currentSpeed }].slice(-10));
      setError(null);
      previousPositionRef.current = newPos;

      reverseGeocode(lat, lng)
        .then(setNearestPlace)
        .catch(() => setNearestPlace("Unknown location"));
    } catch (err) {
      console.error("ISS Fetch Error:", err);
      setError("Uplink Offline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchISSLocation();
    if (autoRefresh) {
      intervalRef.current = window.setInterval(fetchISSLocation, 15000);
    }
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchISSLocation();
  };

  if (loading && history.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 transition-colors duration-300">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          className="mb-6"
        >
          <Satellite size={64} className="text-sky-500" />
        </motion.div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Initializing Mission Control
          </h2>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Establishing secure uplink to ISS telemetry...
          </p>
          <div className="mt-8 flex justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 rounded-full bg-sky-500 animate-bounce"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && history.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <div className="rounded-[2.5rem] bg-white dark:bg-slate-900 p-12 text-center shadow-xl border border-slate-200 dark:border-slate-800 max-w-md">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
            <AlertCircle size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Connection Failed</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            We couldn't establish a connection with the ISS telemetry servers.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3 font-bold text-white shadow-lg shadow-sky-200 dark:shadow-none hover:bg-sky-600 transition-all active:scale-95"
            >
              <RefreshCw size={20} /> Retry Connection
            </button>
            <button
              onClick={() => {
                const mockPos = { lat: 45.4215, lng: -75.6972, timestamp: Math.floor(Date.now() / 1000) };
                setPosition([mockPos.lat, mockPos.lng]);
                setHistory([mockPos]);
                setTrend([{ time: new Date().toLocaleTimeString(), speed: 27600 }]);
                setSpeed(27600);
                setNearestPlace("Ottawa, Canada (Simulated)");
                setError(null);
                setLoading(false);
                toast.success("Simulation Mode Activated");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-8 py-3 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <Globe size={20} /> Simulate Mission Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 lg:px-8 lg:py-8">
      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-6 lg:gap-8">
        <section className="flex flex-col gap-6 rounded-[2.5rem] bg-white/90 dark:bg-slate-900/90 p-6 lg:p-10 shadow-[0_30px_90px_rgba(15,23,42,0.08)] dark:shadow-none border border-slate-200/70 dark:border-slate-800/70 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-500 dark:text-sky-400">
              Mission Control Dashboard
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
              SpaceScope <span className="text-slate-400 dark:text-slate-500">Intelligence</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
              Live orbital telemetry and global space mission intelligence dashboard.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={`Switch to ${isDarkMode ? "Light" : "Dark"} Mode`}
            >
              {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.7fr]">
          <aside className="space-y-6">
            <section className="glass-panel rounded-[2.5rem] p-6 lg:p-8">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                    News Feed
                  </h2>
                  <div className="flex gap-2">
                    {newsCategories.map((category) => (
                      <button
                        key={category.key}
                        onClick={() => refreshCategory(category.key)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title={`Refresh ${category.title}`}
                      >
                        <RefreshCw size={16} className={newsLoading[category.key] ? "animate-spin" : ""} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search intelligence..."
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 text-sm outline-none"
                  />
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="bg-transparent text-xs font-bold text-sky-500 outline-none cursor-pointer"
                  >
                    <option value="date">Latest First</option>
                    <option value="source">Source Index</option>
                  </select>
                </div>

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence mode="popLayout">
                    {allNewsArticles.map((article) => (
                      <motion.article
                        layout
                        key={article.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group grid gap-4 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-4 shadow-sm hover:shadow-xl hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 sm:grid-cols-[100px_minmax(0,_1fr)]"
                      >
                        <img src={article.imageUrl} alt="" className="h-24 w-full rounded-2xl object-cover" />
                        <div>
                          <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-sky-500">
                            {article.source} • {article.author}
                          </div>
                          <h3 className="text-sm font-bold text-slate-950 dark:text-white line-clamp-2">
                            {article.title}
                          </h3>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">{new Date(article.publishedAt).toLocaleDateString()}</span>
                            <a href={article.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-sky-500 hover:underline">Read Intelligence</a>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </section>
          </aside>

          <div className="space-y-6">
            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Coordinate System", value: `${position[0].toFixed(3)}°, ${position[1].toFixed(3)}°`, icon: Globe },
                { label: "Orbital Speed", value: `${speed.toLocaleString()} km/h`, icon: Navigation },
                { label: "Sub-Satellite Point", value: nearestPlace, icon: Info },
                { label: "Data Points", value: `${history.length} active`, icon: Satellite },
              ].map((metric) => (
                <div key={metric.label} className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                      <metric.icon size={18} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{metric.label}</p>
                  </div>
                  <p className="text-xl font-bold text-slate-950 dark:text-white truncate">{metric.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-panel rounded-[2.5rem] p-6 lg:p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-slate-950 dark:text-white">Live Orbital Path</h2>
                <div className="flex gap-3">
                  <button onClick={handleRefresh} className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800"><RefreshCw size={20} /></button>
                </div>
              </div>
              <div className="h-[450px] overflow-hidden rounded-[2rem] border border-slate-200 dark:border-slate-800">
                <MapContainer center={position} zoom={3} style={{ height: "100%", width: "100%" }} zoomControl={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  <Polyline positions={history.map(p => [p.lat, p.lng])} pathOptions={{ color: "#0ea5e9", weight: 4 }} />
                  <Marker position={position} icon={issIcon} />
                  <RecenterMap position={position} />
                </MapContainer>
              </div>
            </section>

            <section className="glass-panel rounded-[2.5rem] p-6 lg:p-8">
              <h2 className="text-xl font-bold text-slate-950 dark:text-white mb-6">Velocity Profile</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="speed" stroke="#0ea5e9" strokeWidth={4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Chatbot
        issData={{ lat: position[0], lng: position[1], speed, nearestPlace, timestamp }}
        newsData={[...newsData.space, ...newsData.science]}
      />
    </div>
  );
};

export default ISSTracker;
