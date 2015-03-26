namespace TopHat
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Net;
    using System.Text;
    using System.Xml;

    class PartialHTTPStream : Stream, IDisposable
    {
        Stream stream;
        WebResponse resp;
        HttpWebRequest req;
        long cacheRemaining = 0;
        const long cachelen = 1024;

        public string Url { get; private set; }
        public override bool CanRead { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override bool CanSeek { get { return true; } }

        long position = 0;
        public override long Position
        {
            get { return position; }
            set
            {
                long delta = value - position;
                if (delta == 0)
                    return;
                if (delta > 0 && delta < cacheRemaining)
                {
                    Console.WriteLine("Seeking in cache");
                    byte[] dummy = new byte[delta];
                    cacheRemaining -= (int)delta;
                    while (delta > 0)
                    {
                        int nread = stream.Read(dummy, 0, (int)delta);
                        if (nread == 0) throw new IOException();
                        delta -= nread;
                    }
                }
                else cacheRemaining = 0;
                position = value;
                Console.WriteLine("Seek {0}", value);
            }
        }

        long? length;
        public override long Length
        {
            get
            {
                if (length == null)
                {
                    Cancel();
                    req = HttpWebRequest.CreateHttp(Url);
                    req.Method = "HEAD";
                    length = req.GetResponse().ContentLength;
                }
                return length.Value;
            }
        }

        public PartialHTTPStream(string Url) { this.Url = Url; }

        public override void SetLength(long value)
        { throw new NotImplementedException(); }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (cacheRemaining <= 0)
            {
                Cancel();
                req = HttpWebRequest.CreateHttp(Url);
                cacheRemaining = Math.Min(Length - Position, Math.Max((long)count, cachelen));
                Console.WriteLine("Cache miss - reading {0} @ {1}", cacheRemaining, Position);
                req.AddRange(Position, Position + cacheRemaining - 1);
                resp = req.GetResponse();
                stream = resp.GetResponseStream();
            }

            long newcount = Math.Min(buffer.Length - offset, Math.Min(cacheRemaining, count));
            int nread = stream.Read(buffer, (int)offset, (int)newcount);
            position += nread;
            cacheRemaining -= nread;
            return nread;
        }

        public override void Write(byte[] buffer, int offset, int count)
        { throw new NotImplementedException(); }

        public override long Seek(long pos, SeekOrigin origin)
        {
            switch (origin)
            {
                case SeekOrigin.End:
                    return Position = Length + pos;
                case SeekOrigin.Begin:
                    return Position = pos;
                case SeekOrigin.Current:
                    return Position += pos;
                default:
                    throw new NotImplementedException();
            }
        }

        public override void Flush() { }

        void Cancel()
        {
            if (req != null)
            {
                req.Abort();
                req = null;
            }
            if (resp != null)
            {
                resp.Dispose();
                resp = null;
            }
            if (stream != null)
            {
                stream.Dispose();
                stream = null;
            }
        }

        new void Dispose()
        {
            base.Dispose();
            Cancel();
        }
    }

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
        	{[Latitude of natural origin, 0]}	System
        	{[Longitude of natural origin, -93]}	Sy
        	{[Scale factor at natural origin, 0.9996]}
        	{[False easting, 500000]}	System.Collect
        	{[False northing, 0]}	System.Collections
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

        static void GetCRS(string codespace, string code, Dictionary<string, double> parmdict)
        {
            XmlDocument proj;
            XmlNamespaceManager projns = LoadEPSG(codespace, "urn:ogc:def:crs:" + code, out proj);

            XmlNode projroot = proj.SelectSingleNode("gml:ProjectedCRS", projns);
            if (projroot == null)
                return;

            XmlNode convlink = projroot.SelectSingleNode("gml:conversion/@xlink:href", projns);
            XmlDocument conv;
            XmlNamespaceManager convns = LoadEPSG(codespace, convlink.Value, out conv);

            foreach (XmlNode param in conv.DocumentElement.SelectNodes("gml:parameterValue/gml:ParameterValue", convns))
            {
                double value = double.Parse(param.SelectSingleNode("gml:value/text()", convns).Value);
                
                string parmlink = param.SelectSingleNode("gml:operationParameter/@xlink:href", convns).Value;
                XmlDocument parm;
                XmlNamespaceManager parmns = LoadEPSG(codespace, parmlink, out parm);
                string parmname = parm.DocumentElement.SelectSingleNode("//gml:name/text()", parmns).Value;
                parmdict[parmname] = value;
            }
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
