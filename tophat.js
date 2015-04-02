$(document).ready(function() {
    // Format a UTM coordinate component for display
    var utmfmt = function(x) {
            return '(' + Math.floor(x / 1e5) + ')' +
                   (1e9 + Math.floor(x) + '').slice(-5)
        },

        // From both geographic and UTM coordinates, and whether we use MGRS "new" or "old",
        // get a zone description string
        zoneFromCoords = function(xg, yg, xu, yu, mgrsNew) {
            var mgrsLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ",
                zoneNo = Math.floor((xg + 180) / 6) + 1,
                zoneLet = mgrsLetters[Math.floor(yg/8 + 12)],
                set = (zoneNo - 1) % 6,
                si = Math.floor(xu / 1e5) - 1,
                i100k = mgrsLetters[(8 * set + si) % 24],
                joff = ((set & 1) ? 5 : 0) + (mgrsNew ? 0 : 10),
                ji = Math.floor(yu / 1e5) + joff,
                j100k = mgrsLetters[ji % 20];
            return zoneNo + zoneLet + ' ' + i100k + j100k;
        },
    
        // Set the content of the info bar at the bottom
        setinfo = function(lng, lat, usedmaps) {
            var content = 'Geographic: ' +
                          lng.toFixed(6) + '°,' + lat.toFixed(6) + '°<br/>'

            for (var i = 0; i < usedmaps.length; i++) {
                var m = usedmaps[i];
                content += m.title + ' / 1:' + m.scale + ' / ';

                var utm = GeographicLib.UTMUPS.Forward(lat, lng,
                        m.a, m.f, m.k0, m.lon0,
                        m.feast, m.fnorth, 16)
                content += 'UTM ' + zoneFromCoords(lng, lat, utm.x, utm.y, m.mgrsNew) + ' ' +
                    utmfmt(utm.x) + 'E,' +utmfmt(utm.y) + 'N / ';

                for (var l = 0; l < m.links.length; l++) {
                    var link = m.links[l];
                    content += '<a href="' + link.href + '">' + link.name + '</a> (' + link.sizemb.toFixed(1) + 'MB) '
                }
                content += '<br/>';
            }

            $('#map-info').html(content)
        },
    
        // Whether the given latitude and longitude fit in the container provided
        fits = function(lng, lat, cont) {
            return lng >= cont.w &&
                   lng <= cont.e &&
                   lat >= cont.s &&
                   lat <= cont.n;
        }
        
        // Recursively scan the given node and its descendents for maps in which
        // the given coordinates fit
        maprecurse = function (lng, lat, node, usedmaps) {
            if (!fits(lng, lat, node))
                return;
            for (var i = 0; i < node.maps.length; i++) {
                if (fits(lng, lat, node.maps[i]))
                    usedmaps.push(node.maps[i]);
            }
            if (lng >= node.x) {
                if (lat >= node.y && 'ne' in node)
                    maprecurse(lng, lat, node.ne, usedmaps);
                if (lat <= node.y && 'se' in node)
                    maprecurse(lng, lat, node.se, usedmaps);
            }
            if (lng <= node.x) {
                if (lat >= node.y && 'nw' in node)
                    maprecurse(lng, lat, node.nw, usedmaps);
                if (lat <= node.y && 'sw' in node)
                    maprecurse(lng, lat, node.sw, usedmaps);
            }
        }
        
        // Called when the mouse is moved over the Google Maps element
        movemap = function(event) {
            var lng = event.latLng.lng(),
                lat = event.latLng.lat(),
                usedmaps = [];

            maprecurse(lng, lat, db, usedmaps);
            setinfo(lng, lat, usedmaps);
        },
        
        // Load the Google Map
        showmap = function(loc) {
          var gm = google.maps,
              opts = { center: loc,
                       zoom: 18,
                       mapTypeId: gm.MapTypeId.HYBRID },
              map = new gm.Map($('#map-canvas').get(0), opts)
          gm.event.addListener(map, 'mousemove', function(event) {
              movemap(event)
          })
        }
    
    // Show the Google Map initially at the current location, defaulting to
    // Thunder Bay
    navigator.geolocation.getCurrentPosition(function(pos) {
        showmap({ lat: pos.coords.latitude,
                  lng: pos.coords.longitude })
      }, function(err) {
        console.log(err)
        showmap({ lat: 48.4353, lng: -89.2268 })
      })
})
