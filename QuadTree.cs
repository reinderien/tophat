namespace TopHat
{
    using System;
    using System.Collections.Generic;
    using System.IO;

    class QuadTree
    {
        class Node
        {
            public Node se, ne, sw, nw;
            public List<Map> maps = new List<Map>();
            public double xsep, ysep, x0, y0, x1, y1;

            public Node(double x0, double x1, double y0, double y1)
            {
                this.x0 = x0;
                this.y0 = y0;
                this.x1 = x1;
                this.y1 = y1;
                xsep = (x0 + x1) / 2;
                ysep = (y0 + y1) / 2;
            }

            public bool Fits(Map map)
            {
                return
                    (x0 <= map.pw) &&
                    (y0 <= map.ps) &&
                    (x1 >= map.pe) &&
                    (y1 >= map.pn);
            }

            public bool Add(Map map)
            {
                // Don't do anything if it doesn't fit here
                if (!Fits(map))
                    return false;

                // Check to see if it fits in any children
                bool
                    w = map.pe <= xsep && map.pw <= xsep,
                    e = map.pe >= xsep && map.pw >= xsep,
                    s = map.pn <= ysep && map.ps <= ysep,
                    n = map.pn >= ysep && map.ps >= ysep;
                if (s && w)
                {
                    if (sw == null) sw = new Node(x0, xsep, y0, ysep);
                    if (!sw.Add(map)) maps.Add(map);
                }
                else if (n && w)
                {
                    if (nw == null) nw = new Node(x0, xsep, ysep, y1);
                    if (!nw.Add(map)) maps.Add(map);
                }
                else if (s && e)
                {
                    if (se == null) se = new Node(xsep, x1, y0, ysep);
                    if (!se.Add(map)) maps.Add(map);
                }
                else if (n && e)
                {
                    if (ne == null) ne = new Node(xsep, x1, ysep, y1);
                    if (!ne.Add(map)) maps.Add(map);
                }
                else maps.Add(map);

                return true;
            }

            public void DebugDump(TextWriter writer, int level)
            {
                string tab = new string(' ', 3*level),
                    tab2 = new string(' ', 3*(level+1)),
                    tab3 = new string(' ', 3*(level+2));
                writer.WriteLine(tab + '{');
                writer.WriteLine("{0}WE={1}/{2}", tab2, x0, x1);
                writer.WriteLine("{0}SN={1}/{2}", tab2, y0, y1);
                writer.WriteLine("{0}maps:", tab2);
                foreach (Map map in maps)
                {
                    writer.WriteLine("{0}WE={1}/{2}", tab3, map.pw, map.pe);
                    writer.WriteLine("{0}NS={1}/{2}", tab3, map.ps, map.pn);
                    writer.WriteLine("{0}{1} - {2}", tab3, map.scale, map.title);
                }
                if (sw != null)
                {
                    writer.WriteLine("{0}SW:", tab2);
                    sw.DebugDump(writer, level+1);
                }
                if (se != null)
                {
                    writer.WriteLine("{0}SE:", tab2);
                    se.DebugDump(writer, level+1);
                }
                if (nw != null)
                {
                    writer.WriteLine("{0}NW:", tab2);
                    nw.DebugDump(writer, level+1);
                }
                if (ne != null)
                {
                    writer.WriteLine("{0}NE:", tab2);
                    ne.DebugDump(writer, level+1);
                }
                writer.WriteLine(tab + '}');
            }

            public void JsonDump(TextWriter writer)
            {
                writer.Write('{');
                writer.Write("w:{0},e:{1},s:{2},n:{3},x:{4},y:{5},", x0, x1, y0, y1, xsep, ysep);
                writer.Write("maps:[");
                foreach (Map map in maps)
                {
                    map.DumpJson(writer);
                    writer.Write(',');
                }
                writer.Write("],");

                if (sw != null)
                {
                    writer.Write("sw:");
                    sw.JsonDump(writer);
                    writer.Write(',');
                }
                if (se != null)
                {
                    writer.Write("se:");
                    se.JsonDump(writer);
                    writer.Write(',');
                }
                if (nw != null)
                {
                    writer.Write("nw:");
                    nw.JsonDump(writer);
                    writer.Write(',');
                }
                if (ne != null)
                {
                    writer.Write("ne:");
                    ne.JsonDump(writer);
                }

                writer.Write('}');
            }
        }

        Node head;

        /*
         * Maps are not only added at the leaf level
         * Multiple maps can be on a node
         * A map cannot be on multiple nodes
         * */

        public void Add(Map map)
        {
            if (head == null)
                head = new Node(map.pw, map.pe, map.ps, map.pn);

            while (!head.Fits(map))
            {
                bool left = map.pw < head.x0,
                    down = map.ps < head.y0;
                double
                    uw = left ? (2*head.x0 - head.x1) : head.x0,
                    ue = uw + 2*(head.x1 - head.x0),
                    us = down ? (2*head.y0 - head.y1) : head.y0,
                    un = us + 2*(head.y1 - head.y0);
                Node newhead = new Node(uw, ue, us, un);
                if (left)
                {
                    if (down) newhead.ne = head;
                    else newhead.se = head;
                }
                else
                {
                    if (down) newhead.nw = head;
                    else newhead.sw = head;
                }

                head = newhead;
            }
            
            if (!head.Add(map))
                throw new ArgumentException();
        }

        public void DebugDump(TextWriter writer)
        {
            head.DebugDump(writer, 0);
        }

        public void JsonDump(TextWriter writer)
        {
            head.JsonDump(writer);
        }
    }
}
