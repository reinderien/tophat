namespace TopHat
{
    using System.Collections.Generic;
    using System.IO;

    class MapLink
    {
        public string name, href;
        public double sizemb;
    }

    class Map
    {
        /*
        Latitude of natural origin, 0  	       -> [unused]
        Longitude of natural origin, -93  	   -> lon0
        Scale factor at natural origin, 0.9996 -> k0
        False easting, 500000  	               -> feast
        False northing, 0  	                   -> fnorth
        Semi-major axis, 6378206.4  	       -> a
        Flattening ratio, 294.978698213898     -> f
             
        There is not a constant scale nor constant w-e n-s distances. Things overlap.
        */
        public string title;
        public int scale;
        public double pw;
        public double pe;
        public double ps;
        public double pn;
        public bool mgrsNew;
        public Dictionary<string, double> parms = new Dictionary<string, double>();
        public List<MapLink> links = new List<MapLink>();

        public void DumpJson(TextWriter writer)
        {
            writer.Write('{');

            writer.Write("w:{0},e:{1},s:{2},n:{3},scale:{4},title:\"{5}\",mgrsNew:{6},",
                pw, pe, ps, pn, scale, title, mgrsNew ? "true" : "false");

            writer.Write("lon0:{0},", parms["Longitude of natural origin"]);
            writer.Write("k0:{0},", parms["Scale factor at natural origin"]);
            writer.Write("feast:{0},", parms["False easting"]);
            writer.Write("fnorth:{0},", parms["False northing"]);
            writer.Write("a:{0},", parms["Semi-major axis"]);
            writer.Write("f:{0},", parms["Flattening ratio"]);

            writer.Write("links:[");
            foreach (MapLink link in links)
            {
                writer.Write('{');
                writer.Write("name:\"{0}\",href:\"{1}\",sizemb:{2}",
                    link.name, link.href, link.sizemb);
                writer.Write("},");
            }
            writer.Write(']');

            writer.Write('}');
        }
    }
}