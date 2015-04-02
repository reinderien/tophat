First, compile and run tophat.exe. It will generate the topographical metadata database db.js.
That contains a quadtree index by geographical coordinate of all of the maps in the chosen
region.

Then, load index.html. It will use tophat.js to put the map in #map-canvas, and the coordinates 
and printable map link for the location under the cursor in #map-info.

If you care about bandwidth, run all Javascript through this:
http://compressorrater.thruhere.net

If something goes wrong, check the Javascript console first.

Links
---------------------------------------------------------------------------

Google Maps Project:
https://console.developers.google.com/project/814819462294

GeographicLib:
http://sourceforge.net/projects/geographiclib/

GeoGratis API:
http://geogratis.gc.ca/geogratis/DevCorner
http://geogratis.gc.ca/api/en/documentation
