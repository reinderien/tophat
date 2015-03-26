namespace TopHat
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Net;
    using System.Xml;

    class TopHat
    {
        static Dictionary<Uri, string> HTTPCache = new Dictionary<Uri, string>();

        static void AddMap(
            string title,
            int scale,
            double pw,
            double pe,
            double ps,
            double pn,
            Dictionary<string, double> parmdict)
        {
            /*
            Latitude of natural origin, 0  	       -> /
            Longitude of natural origin, -93  	   -> lon0
            Scale factor at natural origin, 0.9996 -> k0
            False easting, 500000  	               -> feast
            False northing, 0  	                   -> fnorth
            Semi-major axis, 6378206.4  	       -> a
            Flattening ratio, 294.978698213898     -> f
             
            There is a constant scale (50000) and constant w-e and s-n distances.
            
            */
        }

        static XmlNamespaceManager LoadEPSG(string codespace, string code, out XmlDocument doc)
        {
            Uri codeuri = new Uri(new Uri(codespace),
                            "/indicio/query?request=GetRepositoryItem&id=" + code);
            string hcontent;
            doc = new XmlDocument();
            if (!HTTPCache.TryGetValue(codeuri, out hcontent))
            {
                HttpWebRequest codereq = HttpWebRequest.CreateHttp(codeuri);
                using (WebResponse coderesp = codereq.GetResponse())
                using (StreamReader reader = new StreamReader(coderesp.GetResponseStream()))
                    hcontent = reader.ReadToEnd();
                HTTPCache[codeuri] = hcontent;
            }
            string content = "<?xml version='1.0' encoding='UTF-8'?>\n" + hcontent;
            doc.LoadXml(hcontent);

            XmlNamespaceManager nsman = new XmlNamespaceManager(doc.NameTable);
            nsman.AddNamespace("epsg", "urn:x-ogp:spec:schema-xsd:EPSG:1.0:dataset");
            nsman.AddNamespace("gco", "http://www.isotc211.org/2005/gco");
            nsman.AddNamespace("gmd", "http://www.isotc211.org/2005/gmd");
            nsman.AddNamespace("gml", "http://www.opengis.net/gml/3.2");
            nsman.AddNamespace("xlink", "http://www.w3.org/1999/xlink");
            return nsman;
        }

        static XmlNamespaceManager LoadXlink(string codespace, XmlNode parentnode, XmlNamespaceManager parentns, string gmlnode, out XmlDocument childdoc)
        {
            string link = parentnode.SelectSingleNode(string.Format("gml:{0}/@xlink:href", gmlnode), parentns).Value;
            return LoadEPSG(codespace, link, out childdoc);
        }

        static void GetCRS(string codespace, string code, Dictionary<string, double> parmdict)
        {
            XmlDocument proj;
            XmlNamespaceManager projns = LoadEPSG(codespace, "urn:ogc:def:crs:" + code, out proj);

            XmlNode projroot = proj.SelectSingleNode("gml:ProjectedCRS", projns);
            if (projroot == null)
                return;

            XmlDocument conv;
            XmlNamespaceManager convns = LoadXlink(codespace, projroot, projns, "conversion", out conv);

            foreach (XmlNode param in conv.DocumentElement.SelectNodes("gml:parameterValue/gml:ParameterValue", convns))
            {
                double value = double.Parse(param.SelectSingleNode("gml:value/text()", convns).Value);
                
                XmlDocument parm;
                XmlNamespaceManager parmns = LoadXlink(codespace, param, convns, "operationParameter", out parm);
                string parmname = parm.DocumentElement.SelectSingleNode("//gml:name/text()", parmns).Value;

                parmdict[parmname] = value;
            }

            XmlDocument geocrs;
            XmlNamespaceManager geocrsns = LoadXlink(codespace, projroot, projns, "baseGeodeticCRS", out geocrs);
            XmlDocument datum;
            XmlNamespaceManager datumns = LoadXlink(codespace, geocrs.DocumentElement, geocrsns, "geodeticDatum", out datum);
            XmlDocument ellipsoid;
            XmlNamespaceManager ellns = LoadXlink(codespace, datum.DocumentElement, datumns, "ellipsoid", out ellipsoid);

            double
                smaj = double.Parse(ellipsoid.SelectSingleNode("//gml:semiMajorAxis/text()", ellns).Value),
                f;
            XmlNode fnode = ellipsoid.SelectSingleNode("//gml:inverseFlattening/text()", ellns);

            if (fnode == null)
            {
                double smin = double.Parse(ellipsoid.SelectSingleNode("//gml:semiMinorAxis/text()", ellns).Value);
                f = smaj / (smaj - smin);
            }
            else f = double.Parse(fnode.Value);

            parmdict["Semi-major axis"] = smaj;
            parmdict["Flattening ratio"] = f;
        }

        static void Search(
            double pw,
            double pe,
            double ps,
            double pn)
        {
            // http://geogratis.gc.ca/site/eng/api/documentation/sguide
            Uri uri = new Uri(string.Format(
                "http://geogratis.gc.ca/api/en/nrcan-rncan/ess-sst/-/AND/" +
                "(urn:iso:series)canmatrix-print-ready/(urn:iso:type)map?" +
                "alt=xml&entry-type=full&" +
                "bbox={0},{1},{2},{3}", pw, ps, pe, pn));
            HttpWebRequest req = HttpWebRequest.CreateHttp(uri);
            XmlDocument doc = new XmlDocument();
            using (WebResponse resp = req.GetResponse())
                doc.Load(resp.GetResponseStream());


            XmlNamespaceManager nsman = new XmlNamespaceManager(doc.NameTable);
            nsman.AddNamespace("atom", "http://www.w3.org/2005/Atom");
            nsman.AddNamespace("as", "http://atomserver.org/namespaces/1.0/");
            nsman.AddNamespace("base", "http://geogratis.gc.ca/api/en/nrcan-rncan/ess-sst/");
            nsman.AddNamespace("gco", "http://www.isotc211.org/2005/gco");
            nsman.AddNamespace("georss", "http://www.georss.org/georss");
            nsman.AddNamespace("gmd", "http://www.isotc211.org/2005/gmd");
            nsman.AddNamespace("gml", "http://www.opengis.net/gml");
            nsman.AddNamespace("os", "http://a9.com/-/spec/opensearch/1.1/");

            foreach (XmlNode entry in doc.DocumentElement.SelectNodes("atom:entry", nsman))
            {
                XmlNode
                    title = entry.SelectSingleNode("atom:title/text()", nsman),
                    bw = entry.SelectSingleNode("//gmd:westBoundLongitude/gco:Decimal/text()", nsman),
                    be = entry.SelectSingleNode("//gmd:eastBoundLongitude/gco:Decimal/text()", nsman),
                    bs = entry.SelectSingleNode("//gmd:southBoundLatitude/gco:Decimal/text()", nsman),
                    bn = entry.SelectSingleNode("//gmd:northBoundLatitude/gco:Decimal/text()", nsman),
                    scale = entry.SelectSingleNode("//gmd:spatialResolution//gmd:denominator/gco:Integer/text()", nsman);

                XmlNodeList refsystems = entry.SelectNodes("//gmd:RS_Identifier", nsman);
                Dictionary<string, double> parmdict = new Dictionary<string, double>();
                foreach (XmlNode refsystem in refsystems)
                {
                    XmlNode
                        codespace = refsystem.SelectSingleNode("gmd:codeSpace/gco:CharacterString/text()", nsman),
                        code = refsystem.SelectSingleNode("gmd:code/gco:CharacterString/text()", nsman);
                    GetCRS(codespace.Value, code.Value, parmdict);
                }

                AddMap(
                    title.Value,
                    int.Parse(scale.Value),
                    double.Parse(bw.Value),
                    double.Parse(be.Value),
                    double.Parse(bs.Value),
                    double.Parse(bn.Value),
                    parmdict);
            }
        }

        static void Main()
        {
            Search(-90.1, -88.9, 47.9, 49.1);

            /*
            Form an index tree for geographical coordinates
               Split latitude
               Then split longitude
            */
        }
    }
}
