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

        static HashSet<string> mapNames = new HashSet<string>();

        static QuadTree tree = new QuadTree();

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

        static void GetCRS(string codespace, string code, Map map)
        {
            XmlDocument proj;
            XmlNamespaceManager projns = LoadEPSG(codespace, "urn:ogc:def:crs:" + code, out proj);

            XmlNode projroot = proj.SelectSingleNode("gml:ProjectedCRS", projns);
            if (projroot == null)
                return;

            string projName = projroot.SelectSingleNode("gml:name/text()", projns).Value;

            if (projName.Contains("NAD83"))
                map.mgrsNew = true;
            else
            {
                map.mgrsNew = false;
                if (!projName.Contains("NAD27"))
                    Console.Out.WriteLine("Warning: unknown projection {0}", projName);
            }

            XmlDocument conv;
            XmlNamespaceManager convns = LoadXlink(codespace, projroot, projns, "conversion", out conv);

            foreach (XmlNode param in conv.DocumentElement.SelectNodes("gml:parameterValue/gml:ParameterValue", convns))
            {
                double value = double.Parse(param.SelectSingleNode("gml:value/text()", convns).Value);

                XmlDocument parm;
                XmlNamespaceManager parmns = LoadXlink(codespace, param, convns, "operationParameter", out parm);
                string parmname = parm.DocumentElement.SelectSingleNode("//gml:name/text()", parmns).Value;

                map.parms[parmname] = value;
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

            map.parms["Semi-major axis"] = smaj;
            map.parms["Flattening ratio"] = f;
        }

        static void Search(
            double pw,
            double pe,
            double ps,
            double pn)
        {
            Progress prog = new Progress();

            string uriBase = "http://geogratis.gc.ca/api/en/nrcan-rncan/ess-sst";
            // http://geogratis.gc.ca/site/eng/api/documentation/sguide
            Uri uri = new Uri(string.Format(
                uriBase + "/-/AND/" +
                "(urn:iso:series)canmatrix-print-ready/(urn:iso:type)map?" +
                "alt=xml&entry-type=full&sort-field=spatial&" +
                "bbox={0},{1},{2},{3}", pw, ps, pe, pn));

            int entriesSoFar = 0;
            int? entriesTotal = null;

            for (int pagesSoFar = 0; ; pagesSoFar++)
            {
                if (entriesTotal.HasValue)
                    prog.ShowTick(entriesSoFar, entriesTotal.Value);

                HttpWebRequest req = HttpWebRequest.CreateHttp(uri);
                req.Headers.Add(HttpRequestHeader.AcceptEncoding, "gzip,deflate");
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

                /*
                  <os:totalResults>111</os:totalResults>
                  <os:startIndex>0</os:startIndex>
                  <os:itemsPerPage>3</os:itemsPerPage>
                  */
                XmlElement docroot = doc.DocumentElement;
                entriesTotal = int.Parse(docroot.SelectSingleNode("os:totalResults/text()", nsman).Value);

                foreach (XmlNode entry in doc.DocumentElement.SelectNodes("atom:entry", nsman))
                {
                    prog.ShowTick(entriesSoFar, entriesTotal.Value);

                    Map map = new Map()
                    {
                        title = entry.SelectSingleNode("./atom:title/text()", nsman).Value,
                        scale = int.Parse(entry.SelectSingleNode(".//gmd:spatialResolution//gmd:denominator/gco:Integer/text()", nsman).Value),
                        pw = double.Parse(entry.SelectSingleNode(".//gmd:westBoundLongitude/gco:Decimal/text()", nsman).Value),
                        pe = double.Parse(entry.SelectSingleNode(".//gmd:eastBoundLongitude/gco:Decimal/text()", nsman).Value),
                        ps = double.Parse(entry.SelectSingleNode(".//gmd:southBoundLatitude/gco:Decimal/text()", nsman).Value),
                        pn = double.Parse(entry.SelectSingleNode(".//gmd:northBoundLatitude/gco:Decimal/text()", nsman).Value)
                    };
                    if (mapNames.Contains(map.title))
                    {
                        Console.WriteLine("\nMap '{0}' already loaded", map.title);
                        entriesSoFar++;
                        continue;
                    }
                    mapNames.Add(map.title);
                    tree.Add(map);

                    XmlNodeList refsystems = entry.SelectNodes(".//gmd:RS_Identifier", nsman);
                    Dictionary<string, double> parmdict = new Dictionary<string, double>();
                    foreach (XmlNode refsystem in refsystems)
                    {
                        XmlNode
                            codespace = refsystem.SelectSingleNode("./gmd:codeSpace/gco:CharacterString/text()", nsman),
                            code = refsystem.SelectSingleNode("./gmd:code/gco:CharacterString/text()", nsman);
                        GetCRS(codespace.Value, code.Value, map);
                    }

                    foreach (XmlNode opts in entry.SelectNodes(
                        ".//gmd:MD_DigitalTransferOptions", nsman))
                    {
                        string url = opts.SelectSingleNode(".//gmd:URL/text()", nsman).Value;
                        if (!url.StartsWith("http")) continue;

                        double sizemb = double.Parse(opts.SelectSingleNode("./gmd:transferSize/gco:Real/text()", nsman).Value);
                        if (sizemb < 2) continue;

                        string name = opts.SelectSingleNode(".//gmd:name/gco:CharacterString/text()", nsman).Value;
                        map.links.Add(new MapLink()
                        {
                            name = name,
                            href = url,
                            sizemb = sizemb
                        });
                    }

                    entriesSoFar++;
                }

                // ./-/AND/(urn:iso:series)  ...
                XmlNode nextAttr = docroot.SelectSingleNode("atom:link[@rel = 'next']/@href", nsman);
                if (nextAttr == null) break;
                uri = new Uri(uriBase + nextAttr.Value.TrimStart(new char[] { '.' }));
            }
        }

        static void Main()
        {
            Search(-95, -85, 45, 55);
            Console.Out.WriteLine();

            using (StreamWriter writer = new StreamWriter("db.js"))
            {
                writer.WriteLine("var db = ");
                tree.JsonDump(writer);
            }
        }
    }
}
