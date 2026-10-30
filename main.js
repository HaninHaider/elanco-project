// Import the map, marker and popup tools from MapLibre
import {
    Map as MapLibreMap,
    Marker,
    Popup
} from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';


// ========================================
// 1. MAP SETUP
// ========================================

// Create the interactive UK map using MapLibre
const map = new MapLibreMap({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-3.5, 54.5], // Longitude, latitude
    zoom: 6
});


// ========================================
// 2. TICK SIGHTINGS - GET /tick-sightings
// ========================================

// Elanco's API endpoint for retrieving tick sightings
const SIGHTINGS_URL = "https://dev-task.elancoapps.com/data/tick-sightings";

// Retrieve tick sightings from Elanco's API
async function loadSightings() {
    try {
        const response = await fetch(SIGHTINGS_URL);

        // Check for API errors such as 429 or 500
        if (!response.ok) {

            // Read the API error if a JSON response is available
            const errorBody = await response.json().catch(() => ({}));

            console.error("Elanco API error:", response.status, errorBody);
            return null;
        }

        // Convert the JSON response into JavaScript data
        const sightings = await response.json();

        // Check that the API returned an array
        if (!Array.isArray(sightings)) {
            console.error("Expected an array of sightings:", sightings);
            return null;
        }

        // Return the sightings if everything succeeded
        return sightings;

    } catch (error) {

        // Handle network failures or invalid JSON
        console.error("Failed to load tick sightings:", error);
        return null;
    }
}
// ========================================
// 3. TICK SIGHTINGS - DATA CLEANING
// ========================================

// Returns true if the value is text that isn't empty
function isFilledText(value) {
    return typeof value === "string" && value.trim() !== "";
}

// Removes invalid and duplicate sightings, and returns clean copies
function cleanSightings(sightings) {

    // Store unique sightings using their ID
    const uniqueSightings = new Map();

    // Count invalid and duplicate records
    let invalidRecords = 0;
    let duplicates = 0;

    for (const sighting of sightings) {

        // Skip records with missing or invalid required fields
        if (
            !sighting ||
            !isFilledText(sighting.id) ||
            !isFilledText(sighting.location) ||
            !isFilledText(sighting.species) ||
            !isFilledText(sighting.date) ||
            Number.isNaN(Date.parse(sighting.date))
        ) {
            invalidRecords++;
            continue;
        }

        const id = sighting.id.trim();

        // Skip duplicates (keep the first one we saw)
        if (uniqueSightings.has(id)) {
            duplicates++;
            continue;
        }

        // Store a cleaned copy with the extra spaces removed
        uniqueSightings.set(id, {
            id: id,
            date: sighting.date.trim(),
            location: sighting.location.trim(),
            species: sighting.species.trim(),
            latinName: isFilledText(sighting.latinName) ? sighting.latinName.trim() : null
        });
    }

    return {
        cleaned: [...uniqueSightings.values()],
        invalidRecords: invalidRecords,
        duplicates: duplicates
    };
}

// ========================================
// 4. LOAD AND PROCESS SIGHTINGS
// ========================================

// Retrieve the data using our function
const sightings = await loadSightings();

// Store the cleaned records for the map
let cleanedSightings = [];

if (sightings === null) {

    console.error("Sightings could not be loaded");

} else {

    const result = cleanSightings(sightings);
    cleanedSightings = result.cleaned;

    // Find the different cities in the dataset
    const cities = [...new Set(
        cleanedSightings.map(sighting => sighting.location)
    )].sort();

    console.log("Total records:", sightings.length);
    console.log("Valid unique sightings:", cleanedSightings.length);
    console.log("Duplicates:", result.duplicates);
    console.log("Invalid records:", result.invalidRecords);
    console.log("Cities:", cities);
}


const speciesNames = [...new Set(
    cleanedSightings.map(sighting => sighting.species)
)].sort();
// Display the available species in the console
console.log("Available tick species:", speciesNames);
// Find the species dropdown in our HTML
const speciesFilter = document.getElementById("speciesFilter");

// Add each species returned by Elanco to the dropdown
if (speciesFilter) {
    for (const species of speciesNames) {

        // Create a new dropdown option
        const option = document.createElement("option");

        // Use the actual species name from the API
        option.value = species;
        option.textContent = species;

        // Add the option to the dropdown
        speciesFilter.appendChild(option);
    }
}

// ========================================
// 5. INTERACTIVE MAP - CITY MARKERS
// ========================================

// Approximate city-centre coordinates [longitude, latitude]
// Elanco's API provides city names, not exact sighting coordinates
const cityCoordinates = {
    birmingham: [-1.8904, 52.4862],
    bristol: [-2.5879, 51.4545],
    cardiff: [-3.1791, 51.4816],
    edinburgh: [-3.1883, 55.9533],
    glasgow: [-4.2518, 55.8642],
    leeds: [-1.5491, 53.8008],
    leicester: [-1.1398, 52.6369],
    liverpool: [-2.9916, 53.4084],
    london: [-0.1278, 51.5074],
    manchester: [-2.2426, 53.4808],
    newcastle: [-1.6178, 54.9783],
    nottingham: [-1.1492, 52.9548],
    sheffield: [-1.4701, 53.3811],
    southampton: [-1.4044, 50.9097]
};

// Store the markers currently displayed on the map
let displayedMarkers = [];

// Display sightings based on the selected activity level
function displaySightings(sightings, selectedActivity = "all") {

    // Remove existing markers before creating new ones
    for (const marker of displayedMarkers) {
        marker.remove();
    }

    // Empty the array so it can store the new markers
    displayedMarkers = [];
    // Hide old city details when the map filters change

    document.getElementById("sightingPanel").classList.add("hidden");
document.getElementById("sightingPrompt").classList.remove("hidden");

    // Store how many sightings were reported in each city
    const cityCounts = new Map();
    const missingCities = new Set();

    // Count sightings for each city
    for (const sighting of sightings) {

        // Standardise the city name
        const city = sighting.location.toLowerCase().trim();

        // Skip locations without coordinates
        if (!cityCoordinates[city]) {
            missingCities.add(city);
            continue;
        }

        // Increase the city's sighting count
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    }

    // Stop if no sightings match the selected date or species
    if (cityCounts.size === 0) {
        console.log("No matching sightings");
        return;
    }

    // Sort city counts from lowest to highest
    const counts = [...cityCounts.values()].sort((a, b) => a - b);

    // Calculate relative activity thresholds from the current data
    const lowLimit = counts[Math.floor(counts.length / 3)];
    const highLimit = counts[Math.floor(counts.length * 2 / 3)];

    // Create one marker for each city
    for (const [city, count] of cityCounts) {

        // Start with high activity
        let activityLevel = "high";
        let activityColor = "bg-red-600";

        // Determine the city's activity level
        if (count <= lowLimit) {
            activityLevel = "low";
            activityColor = "bg-green-600";

        } else if (count <= highLimit) {
            activityLevel = "medium";
            activityColor = "bg-yellow-500";
        }

        // Skip cities that don't match the selected activity filter
        if (selectedActivity !== "all" && selectedActivity !== activityLevel) {
            continue;
        }

        // Create a button showing the city's sighting count
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.textContent = count;
        // Show the selected city's sighting information when clicked
markerElement.addEventListener("click", () => {
    showCityDetails(city, sightings);
});

        // Set the marker colour and appearance
        markerElement.className =
            `flex h-9 min-w-9 items-center justify-center rounded-full ${activityColor} px-1 text-xs font-bold text-white border-2 border-white shadow cursor-pointer`;

        // Add an accessible description
        markerElement.setAttribute(
            "aria-label",
            `${count} tick sightings in ${city}, ${activityLevel} reported activity`
        );

        // Create the popup with the city and activity information
        const popup = new Popup({ offset: 25 })
            .setText(`${city}: ${count} sightings (${activityLevel} reported activity, approximate location)`);

        // Add the marker to the map
        const marker = new Marker({ element: markerElement })
            .setLngLat(cityCoordinates[city])
            .setPopup(popup)
            .addTo(map);

        // Save the marker so it can be removed when filters change
        displayedMarkers.push(marker);
    }

    // Display information for testing
    console.log("Visible city markers:", displayedMarkers.length);
    console.log("Cities without coordinates:", [...missingCities]);
}

// ========================================
// 6. FILTER CONTROLS
// ========================================


// Find the date and activity dropdowns in HTML
const dateDropdown = document.getElementById("dateFilter");
const activityDropdown = document.getElementById("activityFilter");
// Get the unique years from Elanco's API data
const availableYears = [...new Set(
    cleanedSightings.map(sighting => sighting.date.slice(0, 4))
)].sort((a, b) => Number(b) - Number(a));

// Add each available year to the Date range dropdown
if (dateDropdown) {
    for (const year of availableYears) {

        // Create a new dropdown option
        const option = document.createElement("option");

        // Store and display the actual year
        option.value = year;
        option.textContent = year;

        // Add the year to the dropdown
        dateDropdown.appendChild(option);
    }
}
// Find the element used to display filter results
const filterStatus = document.getElementById("filterStatus");

// Apply all three filters to the tick sightings
function applyFilters() {

    // Get the selected filter values
    const selectedDate = dateDropdown.value;
    const selectedSpecies = speciesFilter.value;
    const selectedActivity = activityDropdown.value;


    // Filter the cleaned sightings by date and species
    const filteredSightings = cleanedSightings.filter(sighting => {

      // Get the year from the sighting date returned by Elanco
const sightingYear = sighting.date.slice(0, 4);

// Keep all dates or only sightings from the selected year
const matchesDate = selectedDate === "all" ||
    sightingYear === selectedDate;

        // Check whether the sighting matches the selected species
        const matchesSpecies = selectedSpecies === "all" ||
            sighting.species === selectedSpecies;

        // Keep records that match both filters
        return matchesDate && matchesSpecies;
    });

    // Update the map using the filtered records
    // Section 5 handles the activity colours and levels
    displaySightings(filteredSightings, selectedActivity);

    // Update the number of cities displayed
    if (filterStatus) {
        if (displayedMarkers.length === 0) {
            filterStatus.textContent = "No sightings match the selected filters.";
        } else {
            filterStatus.textContent =
                `${displayedMarkers.length} cities shown`;
        }
    }
}

// Check that all three dropdowns exist in HTML
if (dateDropdown && speciesFilter && activityDropdown) {

    // Run the filters whenever the user changes a selection
    dateDropdown.addEventListener("change", applyFilters);
    speciesFilter.addEventListener("change", applyFilters);
    activityDropdown.addEventListener("change", applyFilters);

    // Display all available sightings when the page first loads
    if (sightings !== null) {
        applyFilters();
    } else if (filterStatus) {

        // Show a message if the API request failed
        filterStatus.textContent = "Tick sightings could not be loaded.";
    }

} else {

    // Identify missing filter elements during development
    console.error("One or more filter dropdowns are missing from HTML.");
}

// ========================================
// 7. SIGHTING INFORMATION
// ========================================

// Display information when the user selects a city marker
function showCityDetails(city, sightings) {

    // Find sightings belonging to the selected city
    const citySightings = sightings
        .filter(sighting => sighting.location.toLowerCase().trim() === city)
        .sort((a, b) => b.date.localeCompare(a.date));

    // Stop if no sightings were found
    if (citySightings.length === 0) {
        return;
    }

    // Get the most recent matching sighting
    const latest = citySightings[0];
    const cityName = city.charAt(0).toUpperCase() + city.slice(1);

    // Show the details panel instead of the instructions
    document.getElementById("sightingPrompt").classList.add("hidden");
    document.getElementById("sightingPanel").classList.remove("hidden");

    // Display the selected city and its sighting count
    document.getElementById("selectedCity").textContent = cityName;
    document.getElementById("cityTotal").textContent =
        `${citySightings.length} reported sightings`;

    // Display details from the latest sighting
    document.getElementById("latestDate").textContent =
        new Date(latest.date).toLocaleDateString("en-GB");

    document.getElementById("latestSpecies").textContent = latest.species;
    document.getElementById("latestLatin").textContent =
        latest.latinName || "Not available";
    document.getElementById("latestId").textContent = latest.id;

    // ========================================
    // 7.1 ACTIVITY TIMELINE
    // ========================================

    // Count sightings by year for the selected city
    const yearlyCounts = new Map();

    for (const sighting of citySightings) {
        const year = sighting.date.slice(0, 4);

        yearlyCounts.set(year, (yearlyCounts.get(year) || 0) + 1);
    }

    // Clear the previous city's timeline
    const timeline = document.getElementById("cityTimeline");
    timeline.replaceChildren();

    // Display each year and its number of sightings
    const years = [...yearlyCounts.keys()].sort();

    for (const year of years) {

        // Create one timeline entry for each year
        const item = document.createElement("li");
        item.className = "border-l-2 border-blue-500 pl-3 py-1";

        // Show the real number of sightings in that year
        const count = yearlyCounts.get(year);
        item.textContent = `${year}: ${count} sighting${count === 1 ? "" : "s"}`;

        timeline.appendChild(item);
    }

    // ========================================
    // 7.2 GET DIRECTIONS
    // ========================================

    // Get the approximate coordinates for the selected city
    const [longitude, latitude] = cityCoordinates[city];

    // Open directions to the city centre using Google Maps
    document.getElementById("directionsButton").onclick = () => {
        const url =
            `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

        window.open(url, "_blank", "noopener,noreferrer");
    };

    // ========================================
    // 7.3 SHARE SIGHTING INFORMATION
    // ========================================

    const shareStatus = document.getElementById("shareStatus");
    shareStatus.textContent = "";

    // Prepare the information to share
    const shareText =
        `${cityName}: ${citySightings.length} reported tick sightings. ` +
        `Latest species: ${latest.species}.`;

    document.getElementById("shareButton").onclick = async () => {

        try {
            // Use the device's sharing options when supported
            if (navigator.share) {
                await navigator.share({
                    title: `Tick sightings in ${cityName}`,
                    text: shareText,
                    url: window.location.href
                });

            } else {
                // Otherwise copy the information and website link
                await navigator.clipboard.writeText(
                    `${shareText} ${window.location.href}`
                );

                shareStatus.textContent = "Sighting details copied!";
            }

        } catch (error) {
            // Ignore the user cancelling the sharing window
            if (error.name !== "AbortError") {
                shareStatus.textContent = "Unable to share sighting details.";
                console.error("Sharing failed:", error);
            }
        }
   }; // Ends the Share button's click function
} // Ends showCityDetails()
// ========================================
// 8. SEASONAL ACTIVITY CHART
// ========================================

// Find the chart controls in HTML
const chartCity = document.getElementById("chartCity");
const chartYear = document.getElementById("chartYear");
const chartStatus = document.getElementById("chartStatus");

// Get the available UK cities from Elanco's sightings
const chartCities = [...new Set(
    cleanedSightings.map(sighting => sighting.location)
)].sort();

// Add each available city to the dropdown
for (const city of chartCities) {
    chartCity.add(new Option(city, city));
}

// Reuse the available years found in Section 6
for (const year of availableYears) {
    chartYear.add(new Option(year, year));
}

// Only create the chart if data and the library are available
if (cleanedSightings.length === 0 || !window.Chart) {

    chartStatus.textContent = "Seasonal chart could not be loaded.";

} else {

    // The 12 months shown along the bottom of the chart
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    // Create the bar chart using Chart.js
    const seasonalChart = new window.Chart(
        document.getElementById("seasonalChart"),
        {
            type: "bar",

            data: {
                labels: months,
                datasets: [{
                    label: "Reported sightings",
                    data: Array(12).fill(0),
                    backgroundColor: "#2563eb"
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        }
    );

    // Update the chart when the selected city or year changes
    function updateSeasonalChart() {

        // Start with zero sightings for every month
        const monthlyCounts = Array(12).fill(0);

        // Check each sighting against the selected city and year
        for (const sighting of cleanedSightings) {

            if (
                sighting.location === chartCity.value &&
                sighting.date.slice(0, 4) === chartYear.value
            ) {
                // Convert the month into an array index (0 to 11)
                const monthIndex = Number(sighting.date.slice(5, 7)) - 1;

                // Count the sighting in the correct month
                if (monthIndex >= 0 && monthIndex < 12) {
                    monthlyCounts[monthIndex]++;
                }
            }
        }

        // Replace the chart's values with the calculated counts
        seasonalChart.data.datasets[0].data = monthlyCounts;
        seasonalChart.update();

        // Display the total sightings for this city and year
        const total = monthlyCounts.reduce((sum, count) => sum + count, 0);

        chartStatus.textContent =
            `${total} reported sightings in ${chartCity.value} during ${chartYear.value}.`;
    }

    // Refresh the chart when either dropdown changes
    chartCity.addEventListener("change", updateSeasonalChart);
    chartYear.addEventListener("change", updateSeasonalChart);

    // Display the initial city and year
    updateSeasonalChart();
}
    