import React, { useCallback, useEffect, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import "./WeeklyGrid.css";
import { CalendarEvent, UserAvailability } from "../types/CalendarData";
import {
  fetchCalendarData,
  fetchClassroomsData,
} from "../services/calendarService";

dayjs.extend(isSameOrAfter);

const columnsPerPage = process.env.REACT_APP_COLUMNS_PER_PAGE
  ? Number(process.env.REACT_APP_COLUMNS_PER_PAGE)
  : 10;
const dayStartHour = process.env.REACT_APP_DAY_START_HOUR
  ? Number(process.env.REACT_APP_DAY_START_HOUR)
  : 7;
const dayEndHour = process.env.REACT_APP_DAY_END_HOUR
  ? Number(process.env.REACT_APP_DAY_END_HOUR)
  : 18;
const refreshInterval = process.env.REACT_APP_REFRESH_INTERVAL_MINUTES
  ? Number(process.env.REACT_APP_REFRESH_INTERVAL_MINUTES)
  : 5;

const generateTimeSlots = (start: string, end: string): string[] => {
  const slots: string[] = [];
  let current = dayjs(start);
  const endTime = dayjs(end);

  while (current.isBefore(endTime)) {
    slots.push(current.format("HH:mm"));
    current = current.add(30, "minute");
  }

  return slots;
};

const formatEmail = (email: string): string => {
  const extracted = email.split("-")[1].split("@")[0];
  const capitalized = extracted.charAt(0).toUpperCase() + extracted.slice(1);
  return capitalized;
};

const CalendarGrid: React.FC = () => {
  const [data, setData] = useState<UserAvailability[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [customHours, setCustomHours] = useState(() => {
    const saved = localStorage.getItem("customHours");
    return saved ? JSON.parse(saved) : true; // Default to true if no saved value
  });

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem("autoRefresh");
    return saved ? JSON.parse(saved) : false; // Default to false if no saved value
  });
  const [startOfDay, setStartOfDay] = useState<Dayjs>(
    dayjs()
      .startOf("day")
      .set("hour", dayStartHour)
      .set("minute", 0)
      .set("second", 0)
  );
  const [endOfDay, setEndOfDay] = useState<Dayjs>(
    dayjs()
      .startOf("day")
      .set("hour", dayEndHour)
      .set("minute", 0)
      .set("second", 0)
  );

  const [error, setError] = useState<string | null>(null);

  // Pagination state for columns
  const [currentPage, setCurrentPage] = useState(1);

  const getTimeWindow = useCallback(() => {
    const currentTime = dayjs().hour();
    const startHour = customHours ? currentTime : dayStartHour; // Use custom hours if checkbox is checked
    const endHour = customHours ? currentTime + 3 : dayEndHour; // Use custom hours if checkbox is checked

    // Generate the start and end times for today
    const startOfDay = dayjs()
      .startOf("day")
      .set("hour", startHour)
      .set("minute", 0)
      .set("second", 0);
    const endOfDay = dayjs()
      .startOf("day")
      .set("hour", endHour)
      .set("minute", 0)
      .set("second", 0);

    setStartOfDay(startOfDay);
    setEndOfDay(endOfDay);
  }, [customHours]);

  // Sync `customHours` to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("customHours", JSON.stringify(customHours));
  }, [customHours]);

  // Sync `autoRefresh` to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("autoRefresh", JSON.stringify(autoRefresh));
  }, [autoRefresh]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch classrooms data
        const classroomsResult = await fetchClassroomsData();
        const classrooms = classroomsResult ?? [];

        // Fetch calendar data
        const calendarResult = await fetchCalendarData();
        const data = calendarResult.success ? calendarResult.data : [];

        // Combine classrooms into data
        const updatedData = [...data];
        let hasChanges = false;

        classrooms.forEach((classroom) => {
          if (!updatedData.some((user) => user.userEmail === classroom)) {
            updatedData.push({ userEmail: classroom, userEvent: [] });
            hasChanges = true;
          }
        });

        const sortedData = updatedData.sort((a, b) =>
          a.userEmail.localeCompare(b.userEmail)
        );

        // Update the state if there's any change
        setData(hasChanges ? sortedData : data);
      } catch (err) {
        setError("An error occurred while fetching data.");
      } finally {
        setLoading(false);
      }
    };

    // Fetch data initially
    fetchData();

    // Set interval to fetch data every 5 minutes
    const interval = setInterval(fetchData, refreshInterval * 60000); // 300,000 ms = 5 minutes * 60s * 1000ms

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []); // Run once when the component mounts

  // Trigger getTimeWindow whenever customHours changes
  useEffect(() => {
    getTimeWindow();
  }, [customHours, getTimeWindow]);

  // Set up automatic pagination every 30 seconds
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        setCurrentPage((prevPage) => {
          const totalColumns = data?.length || 0;
          const totalPages = Math.ceil(totalColumns / columnsPerPage);
          const nextPage = prevPage === totalPages ? 1 : prevPage + 1;
          return nextPage;
        });
      }, 30000); // Change page every 30 seconds

      // Clear interval on component unmount or when autoRefresh changes
      return () => clearInterval(interval);
    }
  }, [data, autoRefresh]); // Depend on `data` and `autoRefresh`

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;
  if (!data) return <p>No data available.</p>;

  const handleAutoRefreshChange = () => {
    setAutoRefresh((prev: any) => !prev); // Toggle the auto-refresh state
  };

  const handleTimeWindowChange = () => {
    setCustomHours((prev: any) => !prev); // Toggle custom hours
  };

  // Generate time slots using the dynamic start and end times
  const timeSlots = generateTimeSlots(
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  const isBusy = (timeSlot: string, userEvents: CalendarEvent[]): boolean => {
    // Parse timeSlot and set it to today's date
    const time = dayjs()
      .set("hour", parseInt(timeSlot.split(":")[0]))
      .set("minute", parseInt(timeSlot.split(":")[1]))
      .set("second", 0)
      .set("millisecond", 0);

    return userEvents.some((event) => {
      const eventStart = dayjs(event.StartTime); // Parse the event start time
      const eventEnd = dayjs(event.EndTime); // Parse the event end time

      // Check if the time falls within the event duration
      return (
        event.BusyType === "Busy" &&
        time.isSameOrAfter(eventStart, "minute") &&
        time.isBefore(eventEnd, "minute")
      );
    });
  };

  // Get the user columns for the current page
  const indexOfLastColumn = currentPage * columnsPerPage;
  const indexOfFirstColumn = indexOfLastColumn - columnsPerPage;
  const currentColumns = data.slice(indexOfFirstColumn, indexOfLastColumn);

  // Generate page numbers for columns
  const totalColumns = data.length;
  const totalPages = Math.ceil(totalColumns / columnsPerPage);
  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="classrooms-grid-container">
      <div className="checkbox-container">
        <label>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={handleAutoRefreshChange}
          />
          Enable Auto-Refresh
        </label>
        <label>
          <input
            type="checkbox"
            checked={customHours}
            onChange={handleTimeWindowChange}
          />
          Show only upcoming hours
        </label>
      </div>
      <table border={1} className="weekly-grid-table">
        <thead className="classroom-grid-header">
          <tr>
            <th>Time</th>
            {currentColumns.map((user: any) => (
              <th key={user.userEmail}>{formatEmail(user.userEmail)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot, index) => (
            <tr key={index + "." + slot}>
              <td className="classroom-grid-timeslot">{slot}</td>
              {currentColumns.map((user) => {
                const busy = isBusy(slot, user.userEvent);
                return (
                  <td
                    key={user.userEmail}
                    className={busy ? "busy-cell" : "free-cell"}
                  >
                    {busy ? "Busy" : "Free"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination Controls for Columns */}
      <div className="pagination-container">
        <button
          className="pagination-button"
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        {pageNumbers.map((number) => (
          <button
            className={`pagination-button ${
              currentPage === number ? "active" : ""
            }`}
            key={number}
            onClick={() => setCurrentPage(number)}
          >
            {number}
          </button>
        ))}
        <button
          className="pagination-button"
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default CalendarGrid;
