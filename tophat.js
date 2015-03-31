
/*
Usage
---------------------------------------------------------------------------
This will put the map in #map-canvas, and the coordinates and
printable map link in #map-info.

You cannot load this file directly off of the filesystem due to permissions
issues. Instead it must be hosted - the simplest option being:
python.exe -m http.server

If you care about bandwidth, run all Javascript through this:
http://compressorrater.thruhere.net

If something goes wrong, check the Javascript console first.

Links
---------------------------------------------------------------------------

Google Maps Project:
https://console.developers.google.com/project/814819462294

GeoGratis API:
http://geogratis.gc.ca/geogratis/DevCorner
http://geogratis.gc.ca/api/en/documentation

GeographicLib:
http://sourceforge.net/projects/geographiclib/
*/

$(document).ready(function() {


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    var GeographicLib = {};

    /**
    * \brief Mathematical functions needed by %GeographicLib
    **********************************************************************/
    var
        /**
         * Square a number.
         *
         * @param[in] x
         * @return <i>x</i><sup>2</sup>.
         **********************************************************************/
        GM_sq = function(x) { return x * x },

        /**
         * The hypotenuse function avoiding underflow and overflow.
         *
         * @param[in] x
         * @param[in] y
         * @return sqrt(<i>x</i><sup>2</sup> + <i>y</i><sup>2</sup>).
         **********************************************************************/
        GM_hypot = function(x, y) {
            x = Math.abs(x)
            y = Math.abs(y)
            var a = Math.max(x, y), b = Math.min(x, y) / (a ? a : 1)
            return a * Math.sqrt(1 + b * b)
        },

        /**
         * log(1 + \e x) accurate near \e x = 0.
         *
         * @param[in] x
         * @return log(1 + \e x).
         **********************************************************************/
        GM_log1p = function(x) {
            var
            y = 1 + x,
            z = y - 1
            // Here's the explanation for this magic: y = 1 + z, exactly, and z
            // approx x, thus log(y)/z (which is nearly constant near z = 0) returns
            // a good approximation to the true log(1 + x)/x.  The multiplication x *
            // (log(y)/z) introduces little additional error.
            return z == 0 ? x : x * Math.log(y) / z
        },
        
        /**
         * The inverse hyperbolic sine function.
         *
         * @param[in] x
         * @return asinh(\e x).
         **********************************************************************/
        GM_asinh = function(x) {
            var y = Math.abs(x) // Enforce odd parity
            y = GM_log1p(y * (1 + y/(GM_hypot(1, y) + 1)))
            return x < 0 ? -y : y
        },

        /**
         * The inverse hyperbolic tangent function.
         *
         * @param[in] x
         * @return atanh(\e x).
         **********************************************************************/
        GM_atanh = function(x) {
            var y = Math.abs(x)          // Enforce odd parity
            y = GM_log1p(2 * y/(1 - y))/2
            return x < 0 ? -y : y
        },

        /**
         * The error-free sum of two numbers.
         *
         * @param[in] u
         * @param[in] v
         * @param[out] t the exact error given by (\e u + \e v) - \e s.
         * @return \e s = round(\e u + \e v).
         *
         * See D. E. Knuth, TAOCP, Vol 2, 4.2.2, Theorem B.  (Note that \e t can be
         * the same as one of the first two arguments.)
         **********************************************************************/
        GM_sum = function(u, v) {
            var s = u + v,
                up = s - v,
                vpp = s - up
            up -= u
            vpp -= v
            t = -(up + vpp)
            // u + v =       s      + t
            //       = round(u + v) + t
            return {s: s, t: t}
        },

        /**
         * Normalize an angle (restricted input range).
         *
         * @param[in] x the angle in degrees.
         * @return the angle reduced to the range [&minus;180&deg;, 180&deg;).
         *
         * \e x must lie in [&minus;540&deg;, 540&deg;).
         **********************************************************************/
        GM_AngNormalize = function(x) {
          // Place angle in [-180, 180).  Assumes x is in [-540, 540).
          return x >= 180 ? x - 360 : (x < -180 ? x + 360 : x)
        },

        /**
         * Difference of two angles reduced to [&minus;180&deg;, 180&deg;]
         *
         * @param[in] x the first angle in degrees.
         * @param[in] y the second angle in degrees.
         * @return \e y &minus; \e x, reduced to the range [&minus;180&deg;,
         *   180&deg;].
         *
         * \e x and \e y must both lie in [&minus;180&deg;, 180&deg;].  The result
         * is equivalent to computing the difference exactly, reducing it to
         * (&minus;180&deg;, 180&deg;] and rounding the result.  Note that this
         * prescription allows &minus;180&deg; to be returned (e.g., if \e x is
         * tiny and negative and \e y = 180&deg;).
         **********************************************************************/
        GM_AngDiff = function(x, y) {
            // Compute y - x and reduce to [-180,180] accurately.
            // This is the same logic as the Accumulator class uses.
            var d = y - x,
                yp = d + x,
                xpp = yp - d
            yp -= y
            xpp -= x
            var t =  xpp - yp
            // y - x =       d      + t
            //       = round(y - x) + t
            if ((d - 180) + t > 0)        // y - x > 180
                d -= 360                  // exact
            else if ((d + 180) + t <= 0)  // y - x <= -180
                d += 360                  // exact
            return d + t
        },
        
        GM_digits = 53,
        GM_degree = Math.PI/180,
        GM_epsilon = Math.pow(0.5, GM_digits-1),
    
        // Overflow value s.t. atan(overflow_) = pi/2
        GM_overflow = 1/GM_sq(GM_epsilon),
            
        // tan(x) for x in [-pi/2, pi/2] ensuring that the sign is right
        GM_tanx = function(x) {
          var t = Math.tan(x);
          // Write the tests this way to ensure that tanx(NaN()) is NaN()
          return x >= 0 ?
            (!(t <  0) ? t :  GM_overflow) :
            (!(t >= 0) ? t : -GM_overflow);
        },

   
    
    /**
     * \brief Transverse Mercator projection
     *
     * This uses Kr&uuml;ger's method which evaluates the projection and its
     * inverse in terms of a series.  See
     *  - L. Kr&uuml;ger,
     *    <a href="http://dx.doi.org/10.2312/GFZ.b103-krueger28"> Konforme
     *    Abbildung des Erdellipsoids in der Ebene</a> (Conformal mapping of the
     *    ellipsoidal earth to the plane), Royal Prussian Geodetic Institute, New
     *    Series 52, 172 pp. (1912).
     *  - C. F. F. Karney,
     *    <a href="http://dx.doi.org/10.1007/s00190-011-0445-3">
     *    Transverse Mercator with an accuracy of a few nanometers,</a>
     *    J. Geodesy 85(8), 475--485 (Aug. 2011);
     *    preprint
     *    <a href="http://arxiv.org/abs/1002.1417">arXiv:1002.1417</a>.
     *
     * Kr&uuml;ger's method has been extended from 4th to 6th order.  The maximum
     * error is 5 nm (5 nanometers), ground distance, for all positions within 35
     * degrees of the central meridian.  The error in the convergence is 2
     * &times; 10<sup>&minus;15</sup>&quot; and the relative error in the scale
     * is 6 &minus; 10<sup>&minus;12</sup>%%.  See Sec. 4 of
     * <a href="http://arxiv.org/abs/1002.1417">arXiv:1002.1417</a> for details.
     * The speed penalty in going to 6th order is only about 1%.
     * TransverseMercatorExact is an alternative implementation of the projection
     * using exact formulas which yield accurate (to 8 nm) results over the
     * entire ellipsoid.
     *
     * The ellipsoid parameters and the central scale are set in the constructor.
     * The central meridian (which is a trivial shift of the longitude) is
     * specified as the \e lon0 argument of the TransverseMercator::Forward and
     * TransverseMercator::Reverse functions.  The latitude of origin is taken to
     * be the equator.  There is no provision in this class for specifying a
     * false easting or false northing or a different latitude of origin.
     * However these are can be simply included by the calling function.  For
     * example, the UTMUPS class applies the false easting and false northing for
     * the UTM projections.  A more complicated example is the British National
     * Grid (<a href="http://www.spatialreference.org/ref/epsg/7405/">
     * EPSG:7405</a>) which requires the use of a latitude of origin.  This is
     * implemented by the GeographicLib::OSGB class.
     *
     * See TransverseMercator.cpp for more information on the implementation.
     *
     * See \ref transversemercator for a discussion of this projection.
     *
     * Example of use:
     * \include example-TransverseMercator.cpp
     *
     * <a href="TransverseMercatorProj.1.html">TransverseMercatorProj</a> is a
     * command-line utility providing access to the functionality of
     * TransverseMercator and TransverseMercatorExact.
     **********************************************************************/
    
    /**
     * Constructor for an ellipsoid with
     *
     * @param[in] a equatorial radius (meters).
     * @param[in] f flattening of ellipsoid.  Setting \e f = 0 gives a sphere.
     *   Negative \e f gives a prolate ellipsoid.  If \e f &gt; 1, set
     *   flattening to 1/\e f.
     * @param[in] k0 central scale factor.
     **********************************************************************/

    TransverseMercator = function(_a, f, _k0) {
    
        var // #define GEOGRAPHICLIB_PRECISION 2 (double)
            // #define GEOGRAPHICLIB_TRANSVERSEMERCATOR_ORDER 6
            maxpow_ = 6,
            numit_ = 5,
            // _alp[0] and _bet[0] unused
            _alp = [],
            _bet = [],
            
            _f = f <= 1 ? f : 1/f,
            _n = _f / (2 - _f),
            _e2 = _f * (2 - _f),
            _e = Math.sqrt(Math.abs(_e2)),
            
            // Return e * atanh(e * x) for f >= 0, else return
            // - sqrt(-e2) * atan( sqrt(-e2) * x) for f < 0
            eatanhe = function(x) {
                return _f >= 0 ? _e * GM_atanh(_e * x) : -_e * Math.atan(_e * x)
            },

            nx = GM_sq(_n),
            
            _b1 = 1/(1+_n)*(nx*(nx*(nx+4)+64)+256)/256,
            // _a1 is the equivalent radius for computing the circumference of
            // ellipse.
            _a1 = _b1 * _a
            
        _alp[1] = _n*(_n*(_n*(_n*(_n*(31564*_n-66675)+34440)+47250)-100800)+75600)/151200
        _bet[1] = _n*(_n*(_n*(_n*(_n*(384796*_n-382725)-6720)+932400)-1612800)+1209600)/2419200
        _alp[2] = nx*(_n*(_n*((863232-1983433*_n)*_n+748608)-1161216)+524160)/1935360
        _bet[2] = nx*(_n*(_n*((1695744-1118711*_n)*_n-1174656)+258048)+80640)/3870720
        nx *= _n
        _alp[3] = nx*(_n*(_n*(670412*_n+406647)-533952)+184464)/725760
        _bet[3] = nx*(_n*(_n*(22276*_n-16929)-15984)+12852)/362880
        nx *= _n
        _alp[4] = nx*(_n*(6601661*_n-7732800)+2230245)/7257600
        _bet[4] = nx*((-830251*_n-158400)*_n+197865)/7257600
        nx *= _n
        _alp[5] = (3438171-13675556*_n)*nx/7983360
        _bet[5] = (453717-435388*_n)*nx/15966720
        nx *= _n
        _alp[6] = 212378941*nx/319334400
        _bet[6] = 20648693*nx/638668800

        
        /* Engsager and Poder (2007) use trigonometric series to convert between phi
           and phip.  Here are the series...
          
           Conversion from phi to phip:
          
               phip = phi + sum(c[j] * sin(2*j*phi), j, 1, 6)
          
                 c[1] = - 2 * n
                        + 2/3 * n^2
                        + 4/3 * n^3
                        - 82/45 * n^4
                        + 32/45 * n^5
                        + 4642/4725 * n^6;
                 c[2] =   5/3 * n^2
                        - 16/15 * n^3
                        - 13/9 * n^4
                        + 904/315 * n^5
                        - 1522/945 * n^6;
                 c[3] = - 26/15 * n^3
                        + 34/21 * n^4
                        + 8/5 * n^5
                        - 12686/2835 * n^6;
                 c[4] =   1237/630 * n^4
                        - 12/5 * n^5
                        - 24832/14175 * n^6;
                 c[5] = - 734/315 * n^5
                        + 109598/31185 * n^6;
                 c[6] =   444337/155925 * n^6;
          
           Conversion from phip to phi:
          
               phi = phip + sum(d[j] * sin(2*j*phip), j, 1, 6)
          
                 d[1] =   2 * n
                        - 2/3 * n^2
                        - 2 * n^3
                        + 116/45 * n^4
                        + 26/45 * n^5
                        - 2854/675 * n^6;
                 d[2] =   7/3 * n^2
                        - 8/5 * n^3
                        - 227/45 * n^4
                        + 2704/315 * n^5
                        + 2323/945 * n^6;
                 d[3] =   56/15 * n^3
                        - 136/35 * n^4
                        - 1262/105 * n^5
                        + 73814/2835 * n^6;
                 d[4] =   4279/630 * n^4
                        - 332/35 * n^5
                        - 399572/14175 * n^6;
                 d[5] =   4174/315 * n^5
                        - 144838/6237 * n^6;
                 d[6] =   601676/22275 * n^6;
          
           In order to maintain sufficient relative accuracy close to the pole use
          
               S = sum(c[i]*sin(2*i*phi),i,1,6)
               taup = (tau + tan(S)) / (1 - tau * tan(S))
          
           Here we evaluate the forward transform explicitly and solve the reverse
           one by Newton's method.
          
           taupf and tauf are adapted from TransverseMercatorExact (taup and
           taupinv).  tau = tan(phi), taup = sinh(psi) */
        var taupf = function(tau) {
            if (!(Math.abs(tau) < GM_overflow))
                return tau
            var tau1 = GM_hypot(1, tau),
                sig = Math.sinh( eatanhe(tau / tau1) )
            return GM_hypot(1, sig) * tau - sig * tau1
        }
        
        /**
         * Forward projection, from geographic to transverse Mercator.
         *
         * @param[in] lon0 central meridian of the projection (degrees).
         * @param[in] lat latitude of point (degrees).
         * @param[in] lon longitude of point (degrees).
         * @param[out] x easting of point (meters).
         * @param[out] y northing of point (meters).
         *
         * No false easting or northing is added. \e lat should be in the range
         * [&minus;90&deg;, 90&deg;]; \e lon and \e lon0 should be in the
         * range [&minus;540&deg;, 540&deg;).
         **********************************************************************/
        return function(lon0, lat, lon) {
            
            lon = GM_AngDiff(GM_AngNormalize(lon0), GM_AngNormalize(lon));
            // Explicitly enforce the parity
            var
              latsign = lat < 0 ? -1 : 1,
              lonsign = lon < 0 ? -1 : 1;
            lon *= lonsign;
            lat *= latsign;
            var backside = lon > 90;
            if (backside) {
              if (lat == 0)
                latsign = -1;
              lon = 180 - lon;
            }
            var
              phi = lat * GM_degree,
              lam = lon * GM_degree;
            /* phi = latitude
               phi' = conformal latitude
               psi = isometric latitude
               tau = tan(phi)
               tau' = tan(phi')
               [xi', eta'] = Gauss-Schreiber TM coordinates
               [xi, eta] = Gauss-Krueger TM coordinates
              
               We use
                 tan(phi') = sinh(psi)
                 sin(phi') = tanh(psi)
                 cos(phi') = sech(psi)
                 denom^2    = 1-cos(phi')^2*sin(lam)^2 = 1-sech(psi)^2*sin(lam)^2
                 sin(xip)   = sin(phi')/denom          = tanh(psi)/denom
                 cos(xip)   = cos(phi')*cos(lam)/denom = sech(psi)*cos(lam)/denom
                 cosh(etap) = 1/denom                  = 1/denom
                 sinh(etap) = cos(phi')*sin(lam)/denom = sech(psi)*sin(lam)/denom */
            var etap, xip;
            if (lat != 90) {
              var
                c = Math.max(0, Math.cos(lam)), // cos(pi/2) might be negative
                tau = Math.tan(phi),
                taup = taupf(tau);
              xip = Math.atan2(taup, c);
              // Used to be
              //   etap = GM_atanh(sin(lam) / cosh(psi));
              etap = GM_asinh(Math.sin(lam) / GM_hypot(taup, c));
            } else {
              xip = Math.PI/2;
              etap = 0;
            }
            /* {xi',eta'} is {northing,easting} for Gauss-Schreiber transverse Mercator
               (for eta' = 0, xi' = bet). {xi,eta} is {northing,easting} for transverse
               Mercator with constant scale on the central meridian (for eta = 0, xip =
               rectifying latitude).  Define
              
                 zeta = xi + i*eta
                 zeta' = xi' + i*eta'
              
               The conversion from conformal to rectifying latitude can be expressed as
               a series in _n:
              
                 zeta = zeta' + sum(h[j-1]' * sin(2 * j * zeta'), j = 1..maxpow_)
              
               where h[j]' = O(_n^j).  The reversion of this series gives
              
                 zeta' = zeta - sum(h[j-1] * sin(2 * j * zeta), j = 1..maxpow_)
              
               which is used in Reverse.
              
               Evaluate sums via Clenshaw method.  See
                  http://mathworld.wolfram.com/ClenshawRecurrenceFormula.html
              
               Let
              
                  S = sum(c[k] * F[k](x), k = 0..N)
                  F[n+1](x) = alpha(n,x) * F[n](x) + beta(n,x) * F[n-1](x)
              
               Evaluate S with
              
                  y[N+2] = y[N+1] = 0
                  y[k] = alpha(k,x) * y[k+1] + beta(k+1,x) * y[k+2] + c[k]
                  S = c[0] * F[0](x) + y[1] * F[1](x) + beta(1,x) * F[0](x) * y[2]
              
               Here we have
              
                  x = 2 * zeta'
                  F[n](x) = sin(n * x)
                  a(n, x) = 2 * cos(x)
                  b(n, x) = -1
                  [ sin(A+B) - 2*cos(B)*sin(A) + sin(A-B) = 0, A = n*x, B = x ]
                  N = maxpow_
                  c[k] = _alp[k]
                  S = y[1] * sin(x)
              
               For the derivative we have
              
                  x = 2 * zeta'
                  F[n](x) = cos(n * x)
                  a(n, x) = 2 * cos(x)
                  b(n, x) = -1
                  [ cos(A+B) - 2*cos(B)*cos(A) + cos(A-B) = 0, A = n*x, B = x ]
                  c[0] = 1; c[k] = 2*k*_alp[k]
                  S = (c[0] - y[2]) + y[1] * cos(x) */
            var
              c0 = Math.cos(2 * xip), ch0 = Math.cosh(2 * etap),
              s0 = Math.sin(2 * xip), sh0 = Math.sinh(2 * etap),
              ar = 2 * c0 * ch0, ai = -2 * s0 * sh0, // 2 * cos(2*zeta')
              n = maxpow_,
              xi0 = (n & 1 ? _alp[n] : 0), eta0 = 0,
              xi1 = 0, eta1 = 0,
              // Accumulators for dzeta/dzeta'
              yr0 = (n & 1 ? 2 * maxpow_ * _alp[n--] : 0), yi0 = 0,
              yr1 = 0, yi1 = 0;
            while (n) {
              xi1  = ar * xi0 - ai * eta0 - xi1 + _alp[n];
              eta1 = ai * xi0 + ar * eta0 - eta1;
              yr1 = ar * yr0 - ai * yi0 - yr1 + 2 * n * _alp[n];
              yi1 = ai * yr0 + ar * yi0 - yi1;
              --n;
              xi0  = ar * xi1 - ai * eta1 - xi0 + _alp[n];
              eta0 = ai * xi1 + ar * eta1 - eta0;
              yr0 = ar * yr1 - ai * yi1 - yr0 + 2 * n * _alp[n];
              yi0 = ai * yr1 + ar * yi1 - yi0;
              --n;
            }
            ar /= 2; ai /= 2;             // cos(2*zeta')
            ar = s0 * ch0; ai = c0 * sh0; // sin(2*zeta')
            var
              xi  = xip  + ar * xi0 - ai * eta0,
              eta = etap + ai * xi0 + ar * eta0;
            // Fold in change in convergence and scale for Gauss-Schreiber TM to
            // Gauss-Krueger TM.
            return { y: _a1 * _k0 * (backside ? Math.PI - xi : xi) * latsign,
                     x: _a1 * _k0 * eta * lonsign }
        }
    },
    
    
    
    /**
     * \brief Polar stereographic projection
     *
     * Implementation taken from the report,
     * - J. P. Snyder,
     *   <a href="http://pubs.er.usgs.gov/usgspubs/pp/pp1395"> Map Projections: A
     *   Working Manual</a>, USGS Professional Paper 1395 (1987),
     *   pp. 160--163.
     *
     * This is a straightforward implementation of the equations in Snyder except
     * that Newton's method is used to invert the projection.
     **********************************************************************/
    
    /**
     * Constructor for an ellipsoid with
     *
     * @param[in] a equatorial radius (meters).
     * @param[in] f flattening of ellipsoid.  Setting \e f = 0 gives a sphere.
     *   Negative \e f gives a prolate ellipsoid.  If \e f &gt; 1, set
     *   flattening to 1/\e f.
     * @param[in] k0 central scale factor.
     **********************************************************************/
    PolarStereographic = function(_a, f, _k0) {
        var        
            // Return e * atanh(e * x) for f >= 0, else return
            // - sqrt(-e2) * atan( sqrt(-e2) * x) for f < 0
            eatanhe = function(x) {
                return _f >= 0 ? _e * GM_atanh(_e * x) : -_e * Math.atan(_e * x)
            },

            _f = f <= 1 ? f : 1/f,
            _Cx = exp(eatanhe(1)),
            _c = (1 - _f) * _Cx
        
        /* This formulation converts to conformal coordinates by tau = tan(phi) and
           tau' = tan(phi') where phi' is the conformal latitude.  The formulas are:
              tau = tan(phi)
              secphi = hypot(1, tau)
              sig = sinh(e * atanh(e * tau / secphi))
              taup = tan(phip) = tau * hypot(1, sig) - sig * hypot(1, tau)
              c = (1 - f) * exp(e * atanh(e))
          
           Forward:
             rho = (2*k0*a/c) / (hypot(1, taup) + taup)  (taup >= 0)
                 = (2*k0*a/c) * (hypot(1, taup) - taup)  (taup <  0)
          
           Reverse:
             taup = ((2*k0*a/c) / rho - rho / (2*k0*a/c))/2
          
           Scale:
             k = (rho/a) * secphi * sqrt((1-e2) + e2 / secphi^2)
          
           In limit rho -> 0, tau -> inf, taup -> inf, secphi -> inf, secphip -> inf
             secphip = taup = exp(-e * atanh(e)) * tau = exp(-e * atanh(e)) * secphi */

        return function(northp, lat, lon) {
            lat *= northp ? 1 : -1;
            var
              phi = lat * GM_degree,
              tau = lat != -90 ? GM_tanx(phi) : -GM_overflow,
              secphi = GM_hypot(1, tau),
              sig = Math.sinh( eatanhe(tau / secphi) ),
              taup = GM_hypot(1, sig) * tau - sig * secphi,
              rho = GM_hypot(1, taup) + Math.abs(taup);
            rho = taup >= 0 ? (lat != 90 ? 1/rho : 0) : rho;
            rho *= 2 * _k0 * _a / _c;
            lon = GM_AngNormalize(lon);
            var lam = lon * GM_degree;
            return { x: rho * (lon == -180 ? 0 : Math.sin(lam)),
                     y: (northp ? -rho : rho) * (Math.abs(lon) == 90 ? 0 : Math.cos(lam)) };
        }
    }
    
    

    /**
     * \brief Convert between geographic coordinates and UTM/UPS
     *
     * UTM and UPS are defined
     * - J. W. Hager, J. F. Behensky, and B. W. Drew,
     *   <a href="http://earth-info.nga.mil/GandG/publications/tm8358.2/TM8358_2.pdf">
     *   The Universal Grids: Universal Transverse Mercator (UTM) and Universal
     *   Polar Stereographic (UPS)</a>, Defense Mapping Agency, Technical Manual
     *   TM8358.2 (1989).
     * .
     * Section 2-3 defines UTM and section 3-2.4 defines UPS.  This document also
     * includes approximate algorithms for the computation of the underlying
     * transverse Mercator and polar stereographic projections.  Here we
     * substitute much more accurate algorithms given by
     * GeographicLib:TransverseMercator and GeographicLib:PolarStereographic.
     * These are the algorithms recommended by the NGA document
     * - <a href="http://earth-info.nga.mil/GandG/publications/NGA_SIG_0012_2_0_0_UTMUPS/NGA.SIG.0012_2.0.0_UTMUPS.pdf">
     *   The Universal Grids and the Transverse Mercator and Polar Stereographic
     *   Map Projections</a>, NGA.SIG.0012_2.0.0_UTMUPS (2014).
     *
     * In this implementation, the conversions are closed, i.e., output from
     * Forward is legal input for Reverse and vice versa.  The error is about 5nm
     * in each direction.  However, the conversion from legal UTM/UPS coordinates
     * to geographic coordinates and back might throw an error if the initial
     * point is within 5nm of the edge of the allowed range for the UTM/UPS
     * coordinates.
     *
     * The simplest way to guarantee the closed property is to define allowed
     * ranges for the eastings and northings for UTM and UPS coordinates.  The
     * UTM boundaries are the same for all zones.  (The only place the
     * exceptional nature of the zone boundaries is evident is when converting to
     * UTM/UPS coordinates requesting the standard zone.)  The MGRS lettering
     * scheme imposes natural limits on UTM/UPS coordinates which may be
     * converted into MGRS coordinates.  For the conversion to/from geographic
     * coordinates these ranges have been extended by 100km in order to provide a
     * generous overlap between UTM and UPS and between UTM zones.
     *
     * The <a href="http://www.nga.mil">NGA</a> software package
     * <a href="http://earth-info.nga.mil/GandG/geotrans/index.html">geotrans</a>
     * also provides conversions to and from UTM and UPS.  Version 2.4.2 (and
     * earlier) suffers from some drawbacks:
     * - Inconsistent rules are used to determine the whether a particular UTM or
     *   UPS coordinate is legal.  A more systematic approach is taken here.
     * - The underlying projections are not very accurately implemented.
     *
     * The GeographicLib::UTMUPS::EncodeZone encodes the UTM zone and hemisphere
     * to allow UTM/UPS coordinated to be displayed as, for example, "38N 444500
     * 3688500".  According to NGA.SIG.0012_2.0.0_UTMUPS the use of "N" to denote
     * "north" in the context is not allowed (since a upper case letter in this
     * context denotes the MGRS latitude band).  Consequently, as of version
     * 1.36, EncodeZone uses the lower case letters "n" and "s" to denote the
     * hemisphere.  In addition EncodeZone accepts an optional final argument \e
     * abbrev, which, if false, results in the hemisphere being spelled out as in
     * "38north".
     */
     
    /**
     * In this class we bring together the UTM and UPS coordinates systems.
     * The UTM divides the earth between latitudes &minus;80&deg; and 84&deg;
     * into 60 zones numbered 1 thru 60.  Zone assign zone number 0 to the UPS
     * regions, covering the two poles.  Within UTMUPS, non-negative zone
     * numbers refer to one of the "physical" zones, 0 for UPS and [1, 60] for
     * UTM.  Negative "pseudo-zone" numbers are used to select one of the
     * physical zones.
     **********************************************************************/
     
    /**
     * Forward projection, from geographic to UTM/UPS.
     *
     * @param[in] lat latitude of point (degrees).
     * @param[in] lon longitude of point (degrees).
     * @param[out] x easting of point (meters).
     * @param[out] y northing of point (meters).
     * @param[in] setzone zone override (optional).
     *
     * If \e setzone is omitted, use the standard rules for picking the zone.
     * If \e setzone is given then use that zone if it is non-negative,
     * otherwise apply the rules given in UTMUPS::zonespec.  The accuracy of
     * the conversion is about 5nm.
     **********************************************************************/
    GeographicLib.UTMUPS = { Forward: function(lat, lon, a, f, k0, lon0,
                                               feast, fnorth, setzone) {
        var UPS = 0,
            northp1 = lat >= 0,
            coords,
            utmp = setzone != UPS;
        if (utmp)
          coords = TransverseMercator(a, f, k0)(lon0, lat, lon);
        else
          coords = PolarStereographic(a, f, k0)(northp1, lat, lon);
        coords.x += feast;
        coords.y += fnorth;
        return coords
    }}

    
    
    
    
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////





    var utmfmt = function (x) {
            return '(' + Math.floor(x / 1e5) + ')' +
                   (1e9 + Math.floor(x) + '').slice(-5)
        },

        zoneFromCoords = function (xg, yg, xu, yu, mgrsNew) {
            var mgrsLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ",
                zoneNo = Math.floor((xg + 180) / 6) + 1,
                zoneLet = mgrsLetters[Math.floor((yg + 88) / 8) + 1],
                set = (zoneNo - 1) % 6,
                si = Math.floor(xu / 1e5) - 1,
                i100k = mgrsLetters[(8 * set + si) % 24],
                joff = ((set & 1) ? 5 : 0) + (mgrsNew ? 0 : 10),
                ji = Math.floor(yu / 1e5) + joff,
                j100k = mgrsLetters[ji % 20];
            return zoneNo +zoneLet + ' ' +i100k +j100k;
        },
    
        setinfo = function(lng, lat, usedmaps) {
            var content = 'Geographic: ' +
                          lng.toFixed(6) + '°,' + lat.toFixed(6) + '°<br/>'

            for (var i = 0; i < usedmaps.length; i++) {
                var m = usedmaps[i];
                content += m.title + ' / 1:' + m.scale + ' / ';

                // lat, lon, a, f, k0, lon0,
                // feast, fnorth
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

        fits = function(lng, lat, cont) {
            return lng >= cont.w &&
                   lng <= cont.e &&
                   lat >= cont.s &&
                   lat <= cont.n;
        }
        
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
        
        movemap = function(event, series) {
            var lng = event.latLng.lng(),
                lat = event.latLng.lat(),
                usedmaps = [];

            maprecurse(lng, lat, db, usedmaps);
            setinfo(lng, lat, usedmaps);
        },
        
        gm = google.maps,
        showmap = function(loc) {
          var opts = { center: loc,
                       zoom: 18,
                       mapTypeId: gm.MapTypeId.HYBRID },
              map = new gm.Map($('#map-canvas').get(0), opts)
          gm.event.addListener(map, 'mousemove', function(event) {
              movemap(event)
          })
        }
    
    navigator.geolocation.getCurrentPosition(function(pos) {
        showmap({ lat: pos.coords.latitude,
                  lng: pos.coords.longitude })
      }, function(err) {
        console.log(err)
        showmap({ lat: 48.4353, lng: -89.2268 })
      })
})
